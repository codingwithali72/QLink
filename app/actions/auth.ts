"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.error("Login Error:", error.message);
        return { error: error.message };
    }

    // Find the clinic for this user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.error("No user found after login");
        return { error: "User not found" };
    }

    // Fetch staff user record to get clinic_id
    const { data: staffUser, error: staffError } = await supabase
        .from('staff_users')
        .select('clinic_id')
        .eq('email', email)
        .limit(1)
        .maybeSingle();

    if (staffError || !staffUser) {
        console.error("Staff user lookup failed:", staffError?.message || "User not found in staff_users table");
        await supabase.auth.signOut();
        return { error: "No clinic associated with this account." };
    }

    // Fetch clinic slug
    const { data: clinic, error: clinicError } = await supabase
        .from('clinics')
        .select('slug')
        .eq('id', staffUser.clinic_id)
        .single();

    if (clinicError || !clinic) {
        console.error("Clinic lookup failed:", clinicError?.message);
        await supabase.auth.signOut();
        return { error: "Clinic not found." };
    }

    revalidatePath("/", "layout");
    redirect(`/${clinic.slug}/reception`);
}

export async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    redirect("/login");
}
