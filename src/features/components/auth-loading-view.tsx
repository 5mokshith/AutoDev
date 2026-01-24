import { Spinner } from "@/components/ui/spinner";

export function AuthLoadingView() {
    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <Spinner className="size-6"/>
        </div>
    );
}