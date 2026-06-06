{
  "targets": [
    {
      "target_name": "decklink_output",
      "sources": [
        "decklink_output.cc",
        "<!(node -e \"console.log(require('path').join(process.env.DECKLINK_SDK || '', 'DeckLinkAPI_i.c'))\")"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!(node -e \"console.log(process.env.DECKLINK_SDK || '')\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='win'", {
          "libraries": ["ole32.lib", "oleaut32.lib"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
