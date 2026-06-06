// Native Blackmagic DeckLink output addon for the multiviewer.
//
// Builds on WINDOWS ONLY (needs the DeckLink SDK + Desktop Video driver).
// Exposes to JavaScript:
//   init({width,height,mode,deviceIndex,audioEnabled,audioChannels,audioSampleRate})
//   pushVideoFrame(Buffer bgra)   // one interlaced 1080i59.94 frame, BGRA, top-down
//   pushAudio(Buffer pcm16)       // interleaved 16-bit PCM at audioSampleRate
//   stop()
//
// Scheduling model: a small pool of pre-allocated DeckLink frames. Each
// pushVideoFrame copies BGRA into a free frame and schedules it on a running
// timeline (timeScale 60000, frameDuration 1001 => 29.97 interlaced fps =
// 59.94 fields/s). The driver's completion callback recycles frames back into
// the pool. Audio is scheduled as a continuous stream.

#include <napi.h>

#include <atomic>
#include <mutex>
#include <vector>

#include <combaseapi.h>
#include "DeckLinkAPI_h.h"

namespace {

constexpr BMDTimeScale kTimeScale = 60000;
constexpr BMDTimeValue kFrameDuration = 1001;  // 30000/1001 ~= 29.97 fps
constexpr int kPoolSize = 8;
constexpr int kPreroll = 3;

class OutputCallback;  // fwd

struct State {
  IDeckLinkOutput* output = nullptr;
  OutputCallback* callback = nullptr;

  int width = 1920;
  int height = 1080;
  int rowBytes = 1920 * 4;

  bool audioEnabled = false;
  int audioChannels = 2;

  std::mutex poolMutex;
  std::vector<IDeckLinkVideoFrame*> allFrames;   // owns refs, released on stop()
  std::vector<IDeckLinkVideoFrame*> freeFrames;  // ready to reuse

  BMDTimeValue nextDisplayTime = 0;
  std::atomic<int> scheduledCount{0};
  bool started = false;
  bool comInitialized = false;
};

State g_state;

// IDeckLinkVideoOutputCallback: recycles completed frames + tracks stop.
class OutputCallback : public IDeckLinkVideoOutputCallback {
 public:
  OutputCallback() : refCount_(1) {}

  HRESULT STDMETHODCALLTYPE ScheduledFrameCompleted(
      IDeckLinkVideoFrame* completedFrame,
      BMDOutputFrameCompletionResult /*result*/) override {
    std::lock_guard<std::mutex> lock(g_state.poolMutex);
    g_state.freeFrames.push_back(completedFrame);
    return S_OK;
  }

  HRESULT STDMETHODCALLTYPE ScheduledPlaybackHasStopped() override { return S_OK; }

  // IUnknown
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, LPVOID* ppv) override {
    if (!ppv) return E_POINTER;
    if (iid == IID_IUnknown || iid == IID_IDeckLinkVideoOutputCallback) {
      *ppv = static_cast<IDeckLinkVideoOutputCallback*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++refCount_; }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG c = --refCount_;
    if (c == 0) delete this;
    return c;
  }

 private:
  std::atomic<ULONG> refCount_;
};

IDeckLink* GetDeckLinkAtIndex(int index) {
  IDeckLinkIterator* iterator = nullptr;
  if (CoCreateInstance(CLSID_CDeckLinkIterator, nullptr, CLSCTX_ALL,
                       IID_IDeckLinkIterator,
                       reinterpret_cast<void**>(&iterator)) != S_OK ||
      !iterator) {
    return nullptr;
  }
  IDeckLink* device = nullptr;
  int i = 0;
  while (iterator->Next(&device) == S_OK) {
    if (i == index) break;
    device->Release();
    device = nullptr;
    i++;
  }
  iterator->Release();
  return device;  // may be nullptr if index out of range
}

void ThrowIf(const Napi::Env& env, bool cond, const char* msg) {
  if (cond) throw Napi::Error::New(env, msg);
}

// init(options) -------------------------------------------------------------
Napi::Value Init(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object opts = info[0].As<Napi::Object>();

  g_state.width = opts.Get("width").ToNumber().Int32Value();
  g_state.height = opts.Get("height").ToNumber().Int32Value();
  g_state.rowBytes = g_state.width * 4;
  g_state.audioEnabled =
      opts.Has("audioEnabled") && opts.Get("audioEnabled").ToBoolean().Value();
  g_state.audioChannels =
      opts.Has("audioChannels") ? opts.Get("audioChannels").ToNumber().Int32Value() : 2;
  int deviceIndex =
      opts.Has("deviceIndex") ? opts.Get("deviceIndex").ToNumber().Int32Value() : 0;

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  g_state.comInitialized = SUCCEEDED(hr) || hr == S_FALSE || hr == RPC_E_CHANGED_MODE;

  IDeckLink* device = GetDeckLinkAtIndex(deviceIndex);
  ThrowIf(env, device == nullptr, "No DeckLink device found at the configured deviceIndex.");

  hr = device->QueryInterface(IID_IDeckLinkOutput,
                              reinterpret_cast<void**>(&g_state.output));
  device->Release();
  ThrowIf(env, FAILED(hr) || !g_state.output,
          "Selected DeckLink device has no output interface.");

  // 1080i59.94 output.
  hr = g_state.output->EnableVideoOutput(bmdModeHD1080i5994,
                                         bmdVideoOutputFlagDefault);
  ThrowIf(env, FAILED(hr), "EnableVideoOutput(1080i59.94) failed.");

  if (g_state.audioEnabled) {
    hr = g_state.output->EnableAudioOutput(
        bmdAudioSampleRate48kHz, bmdAudioSampleType16bitInteger,
        g_state.audioChannels, bmdAudioOutputStreamContinuous);
    ThrowIf(env, FAILED(hr), "EnableAudioOutput failed.");
  }

  g_state.callback = new OutputCallback();
  g_state.output->SetScheduledFrameCompletionCallback(g_state.callback);

  // Pre-allocate the frame pool.
  std::lock_guard<std::mutex> lock(g_state.poolMutex);
  for (int i = 0; i < kPoolSize; i++) {
    IDeckLinkMutableVideoFrame* frame = nullptr;
    hr = g_state.output->CreateVideoFrame(g_state.width, g_state.height,
                                          g_state.rowBytes, bmdFormat8BitBGRA,
                                          bmdFrameFlagDefault, &frame);
    ThrowIf(env, FAILED(hr) || !frame, "CreateVideoFrame failed.");
    g_state.allFrames.push_back(frame);
    g_state.freeFrames.push_back(frame);
  }

  g_state.nextDisplayTime = 0;
  g_state.scheduledCount = 0;
  g_state.started = false;
  return env.Undefined();
}

// pushVideoFrame(Buffer) ----------------------------------------------------
Napi::Value PushVideoFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_state.output) return env.Undefined();

  Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
  const size_t expected = static_cast<size_t>(g_state.rowBytes) * g_state.height;
  if (buf.Length() != expected) return env.Undefined();  // ignore bad-sized frame

  IDeckLinkVideoFrame* frame = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_state.poolMutex);
    if (g_state.freeFrames.empty()) return env.Undefined();  // drop if backed up
    frame = g_state.freeFrames.back();
    g_state.freeFrames.pop_back();
  }

  void* dst = nullptr;
  if (frame->GetBytes(&dst) == S_OK && dst) {
    memcpy(dst, buf.Data(), expected);
  }

  g_state.output->ScheduleVideoFrame(frame, g_state.nextDisplayTime,
                                     kFrameDuration, kTimeScale);
  g_state.nextDisplayTime += kFrameDuration;
  int n = ++g_state.scheduledCount;

  if (!g_state.started && n >= kPreroll) {
    g_state.output->StartScheduledPlayback(0, kTimeScale, 1.0);
    g_state.started = true;
  }
  return env.Undefined();
}

// pushAudio(Buffer) ---------------------------------------------------------
Napi::Value PushAudio(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!g_state.output || !g_state.audioEnabled) return env.Undefined();

  Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
  const uint32_t bytesPerFrame = g_state.audioChannels * 2;  // 16-bit
  if (bytesPerFrame == 0) return env.Undefined();
  uint32_t frames = static_cast<uint32_t>(buf.Length() / bytesPerFrame);
  if (frames == 0) return env.Undefined();

  uint32_t written = 0;
  g_state.output->ScheduleAudioSamples(buf.Data(), frames, 0, 0, &written);
  return env.Undefined();
}

// stop() --------------------------------------------------------------------
Napi::Value Stop(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_state.output) {
    BMDTimeValue actual = 0;
    if (g_state.started) {
      g_state.output->StopScheduledPlayback(0, &actual, kTimeScale);
      g_state.started = false;
    }
    g_state.output->SetScheduledFrameCompletionCallback(nullptr);
    if (g_state.audioEnabled) g_state.output->DisableAudioOutput();
    g_state.output->DisableVideoOutput();

    {
      std::lock_guard<std::mutex> lock(g_state.poolMutex);
      for (IDeckLinkVideoFrame* f : g_state.allFrames) f->Release();
      g_state.allFrames.clear();
      g_state.freeFrames.clear();
    }

    g_state.output->Release();
    g_state.output = nullptr;
  }
  if (g_state.callback) {
    g_state.callback->Release();
    g_state.callback = nullptr;
  }
  if (g_state.comInitialized) {
    CoUninitialize();
    g_state.comInitialized = false;
  }
  return env.Undefined();
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  exports.Set("init", Napi::Function::New(env, Init));
  exports.Set("pushVideoFrame", Napi::Function::New(env, PushVideoFrame));
  exports.Set("pushAudio", Napi::Function::New(env, PushAudio));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}

}  // namespace

NODE_API_MODULE(decklink_output, InitModule)
