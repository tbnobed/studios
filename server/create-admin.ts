import { storage } from "./storage";

async function createAdmin() {
  console.log("🔑 Creating admin user...");
  
  try {
    const adminUser = await storage.createUser({
      username: "admin",
      email: "admin@obtv.com",
      password: "admin123", // This will be properly hashed by the storage layer
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
    });

    console.log("✅ Admin user created successfully!");
    console.log("Login with: admin / admin123");
    
    // Test the login immediately
    const verified = await storage.verifyUserPassword("admin", "admin123");
    console.log("✅ Password verification test:", !!verified);
    
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
  }
}

createAdmin().then(() => process.exit(0));