"use client";
import { ClerkProvider, SignInButton, SignOutButton, useAuth, UserButton } from "@clerk/nextjs";
import { Authenticated, ConvexReactClient, AuthLoading,Unauthenticated } from "convex/react";
import { ReactNode } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ThemeProvider } from "@/components/theme-provider";

import { UnauthenticatedView } from "@/features/components/unautheticated-view";
import { AuthLoadingView } from "@/features/components/auth-loading-view";
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
    return (
        <ClerkProvider>
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem
                    disableTransitionOnChange
                >
                    <Authenticated>
                        <UserButton />
                    {children}
                    </Authenticated>
                    <Unauthenticated>
                        <UnauthenticatedView />
                    </Unauthenticated>
                    <AuthLoading>
                       <AuthLoadingView />
                    </AuthLoading>
                </ThemeProvider>
            </ConvexProviderWithClerk>
        </ClerkProvider>
    );
}