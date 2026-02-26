"use client";

import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormStatus } from "react-dom";
import { useState } from "react";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in..." : "Sign In"}
        </Button>
    );
}

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        const res = await login(formData);
        if (res?.error) {
            setError(res.error);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Sign in to QLink
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Receptionist Dashboard Access
                    </p>
                </div>
                <form className="mt-8 space-y-6" action={handleSubmit}>
                    <div className="-space-y-px rounded-md shadow-sm">
                        <div>
                            <Label htmlFor="email-address" className="sr-only">
                                Email address
                            </Label>
                            <Input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <Label htmlFor="password" className="sr-only">
                                Password
                            </Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                placeholder="Password"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center font-medium">
                            {error}
                        </div>
                    )}

                    <div>
                        <SubmitButton />
                    </div>
                </form>
            </div>
        </div>
    );
}
