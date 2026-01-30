"use client";

import { ShieldAlertIcon } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export const UnauthenticatedView = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sign-in");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-lg">
        <Item variant="outline" className="bg-card/60 backdrop-blur">
          <ItemMedia variant="icon">
            <ShieldAlertIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Sign in required</ItemTitle>
            <ItemDescription>
              Redirecting you to the sign-in page...
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <SignInButton>
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </SignInButton>
          </ItemActions>
        </Item>
      </div>
    </div>
  );
};
