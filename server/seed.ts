import { db } from "./db";
import { users, studios, streams, userStudioPermissions } from "@shared/schema";
import bcrypt from "bcrypt";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create default admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);
    
    const [adminUser] = await db.insert(users).values({
      username: "admin",
      email: "admin@obtv.com",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
    }).onConflictDoNothing().returning();

    console.log("✅ Created admin user - Username: admin, Password: admin123");

    // Create the four studios
    const studioData = [
      {
        name: "SoCal",
        location: "Southern California",
        description: "Main studio facility in Southern California",
        colorCode: "#FEDC97",
        isActive: true,
      },
      {
        name: "Plex",
        location: "Plexus Studios", 
        description: "Secondary production facility",
        colorCode: "#7C9885",
        isActive: true,
      },
      {
        name: "Irving",
        location: "Irving, Texas",
        description: "Texas regional studio",
        colorCode: "#B5B682", 
        isActive: true,
      },
      {
        name: "Nashville",
        location: "Nashville, Tennessee",
        description: "Music City production center",
        colorCode: "#28666E",
        isActive: true,
      },
    ];

    const createdStudios = await db.insert(studios).values(studioData).onConflictDoNothing().returning();
    console.log(`✅ Created ${createdStudios.length} studios`);

    // Create sample streams for each studio
    const streamData = [];
    for (const studio of createdStudios) {
      const studioStreams = [
        {
          studioId: studio.id,
          name: `${studio.name} Main Camera`,
          description: "Primary camera feed",
          streamUrl: `webrtc://stream.obtv.com/live/${studio.name.toLowerCase()}_main`,
          resolution: "1080p",
          fps: 30,
          status: "online" as const,
          isActive: true,
        },
        {
          studioId: studio.id,
          name: `${studio.name} Wide Shot`,
          description: "Wide angle studio view",
          streamUrl: `webrtc://stream.obtv.com/live/${studio.name.toLowerCase()}_wide`,
          resolution: "1080p", 
          fps: 30,
          status: "online" as const,
          isActive: true,
        },
        {
          studioId: studio.id,
          name: `${studio.name} Close Up`,
          description: "Close-up camera feed",
          streamUrl: `webrtc://stream.obtv.com/live/${studio.name.toLowerCase()}_close`,
          resolution: "720p",
          fps: 30,
          status: "online" as const,
          isActive: true,
        },
        {
          studioId: studio.id,
          name: `${studio.name} Overhead`,
          description: "Overhead camera view",
          streamUrl: `webrtc://stream.obtv.com/live/${studio.name.toLowerCase()}_overhead`,
          resolution: "720p",
          fps: 24,
          status: "offline" as const,
          isActive: true,
        },
      ];
      
      streamData.push(...studioStreams);
    }

    const createdStreams = await db.insert(streams).values(streamData).onConflictDoNothing().returning();
    console.log(`✅ Created ${createdStreams.length} streams`);

    // Give admin user access to all studios
    if (adminUser) {
      const permissions = createdStudios.map(studio => ({
        userId: adminUser.id,
        studioId: studio.id,
        canView: true,
        canControl: true,
      }));

      await db.insert(userStudioPermissions).values(permissions).onConflictDoNothing();
      console.log("✅ Granted admin user access to all studios");
    }

    // Create a sample operator user
    const operatorPassword = await bcrypt.hash("operator123", 10);
    const [operatorUser] = await db.insert(users).values({
      username: "operator",
      email: "operator@obtv.com", 
      password: operatorPassword,
      firstName: "Studio",
      lastName: "Operator",
      role: "operator",
      isActive: true,
    }).onConflictDoNothing().returning();

    if (operatorUser && createdStudios.length > 0) {
      // Give operator access to first two studios
      const operatorPermissions = createdStudios.slice(0, 2).map(studio => ({
        userId: operatorUser.id,
        studioId: studio.id,
        canView: true,
        canControl: true,
      }));

      await db.insert(userStudioPermissions).values(operatorPermissions).onConflictDoNothing();
      console.log("✅ Created operator user - Username: operator, Password: operator123");
    }

    // Create a sample viewer user
    const viewerPassword = await bcrypt.hash("viewer123", 10);
    const [viewerUser] = await db.insert(users).values({
      username: "viewer",
      email: "viewer@obtv.com",
      password: viewerPassword,
      firstName: "Content",
      lastName: "Viewer", 
      role: "viewer",
      isActive: true,
    }).onConflictDoNothing().returning();

    if (viewerUser && createdStudios.length > 0) {
      // Give viewer access to one studio (view only)
      await db.insert(userStudioPermissions).values({
        userId: viewerUser.id,
        studioId: createdStudios[0].id,
        canView: true,
        canControl: false,
      }).onConflictDoNothing();
      console.log("✅ Created viewer user - Username: viewer, Password: viewer123");
    }

    console.log("\n🎉 Database seeded successfully!");
    console.log("\nLogin credentials:");
    console.log("Admin: admin / admin123");
    console.log("Operator: operator / operator123");
    console.log("Viewer: viewer / viewer123");

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

// Run if called directly
seed().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});

export { seed };