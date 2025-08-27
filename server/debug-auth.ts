import { storage } from "./storage";
import bcrypt from "bcrypt";

async function debugAuth() {
  console.log("🔍 Debugging authentication...");
  
  try {
    // Check if user exists
    const user = await storage.getUserByUsername("admin");
    console.log("User found:", !!user);
    console.log("User data:", user ? {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    } : "Not found");

    if (user) {
      // Test password verification
      const isValidPassword = await bcrypt.compare("admin123", user.password);
      console.log("Password is valid:", isValidPassword);
      
      // Test storage method
      const verifiedUser = await storage.verifyUserPassword("admin", "admin123");
      console.log("Storage verification result:", !!verifiedUser);
    }
    
  } catch (error) {
    console.error("Debug error:", error);
  }
}

debugAuth().then(() => process.exit(0));