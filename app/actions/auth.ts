"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const supabase = createClient();

    const { error, data: authData } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.error("Login Error:", error.message);
        return { error: error.message };
    }

    // Find the logged-in user
    const user = authData.user;
    if (!user) {
        return { error: "User not found" };
    }

    // 1. IS SUPER ADMIN BYPASS?
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@qlink.com";
    if (user.email === ADMIN_EMAIL) {
        // Just let them straight into the Super Admin panel.
        revalidatePath("/admin", "layout");
        redirect("/admin");
    }

    // 2. IS REGULAR STAFF? Let's find their clinic routing
    // Fetch staff user record to get business_id
    const { data: staffUser, error: staffError } = await supabase
        .from('staff_users')
        .select('business_id')
        .eq('id', user.id) // Query by UUID, since email is removed from staff_users
        .limit(1)
        .maybeSingle();

    if (staffError || !staffUser) {
        console.error("Staff user lookup failed:", staffError?.message || "User not found in staff_users table");
        await supabase.auth.signOut();
        return { error: "No clinic associated with this account. Check with Admin." };
    }

    // Fetch clinic slug
    const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('slug')
        .eq('id', staffUser.business_id)
        .single();

    if (businessError || !business) {
        console.error("Clinic lookup failed:", businessError?.message);
        await supabase.auth.signOut();
        return { error: "Clinic not found or deactivated." };
    }

    revalidatePath("/", "layout");
    redirect(`/clinic/${business.slug}/reception`);
}

export async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    redirect("/login");
}
