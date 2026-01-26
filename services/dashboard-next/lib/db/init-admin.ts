import { db } from "@/lib/db";
import { users } from "@/lib/db/platform-schema";
import { userService } from "@/lib/services/user-service";
import { eq } from "drizzle-orm";

export async function initializeAdminUser(): Promise<void> {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    console.log("[InitAdmin] ADMIN_PASSWORD not set, skipping admin initialization");
    return;
  }
  
  try {
    const existingAdmin = await db.select()
      .from(users)
      .where(eq(users.username, adminUsername))
      .limit(1);
    
    if (existingAdmin.length > 0) {
      console.log(`[InitAdmin] Admin user '${adminUsername}' already exists`);
      return;
    }
    
    const adminUser = await userService.createUser({
      username: adminUsername,
      password: adminPassword,
      role: "admin",
    });
    
    console.log(`[InitAdmin] Created admin user '${adminUsername}' with ID: ${adminUser.id}`);
  } catch (error: any) {
    if (error.message?.includes('duplicate key') || error.code === '23505') {
      console.log(`[InitAdmin] Admin user '${adminUsername}' already exists`);
    } else {
      console.error("[InitAdmin] Error creating admin user:", error.message);
    }
  }
}

export async function ensureTablesExist(): Promise<boolean> {
  try {
    await db.select().from(users).limit(1);
    return true;
  } catch (error: any) {
    if (error.message?.includes('relation "users" does not exist')) {
      console.log("[InitAdmin] Users table does not exist yet, run migrations first");
      return false;
    }
    throw error;
  }
}
