import { ShieldAlertIcon } from "lucide-react";
import {
    Item,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
    ItemActions,
} from "@/components/ui/item";
import { SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

export function UnauthenticatedView() {
    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className="w-full max-w-lg bg-muted">

                <Item variant="outline">
                    <ItemMedia variant="icon">
                        <ShieldAlertIcon></ShieldAlertIcon>
                    </ItemMedia>
                    <ItemContent>
                        <ItemTitle>Unauthenticated</ItemTitle>
                        <ItemDescription>Please sign in to continue</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                        <SignInButton >
                            <Button variant="outline" size="sm">Sign In</Button>
                        </SignInButton>
                    </ItemActions>
                </Item>
            </div>
        </div>
    );
}