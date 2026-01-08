"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/provider/theme-provider";
import { LogOut, User } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
export function getInitials(name: string): string {
  // Split the name by spaces to get individual words
  const words = name.split(" ");
  // Map over the words array, extracting the first letter of each word and converting it to uppercase
  const initials = words.map((word) => word.charAt(0).toUpperCase());
  // Join the initials into a single string
  return initials.join("");
}

export function UserAvatar() {
  const session = useSession();
  return (
    <Avatar className="h-10 w-10">
      <AvatarImage src={session.data?.user.image ?? ""} />
      <AvatarFallback>
        {getInitials(session.data?.user.name ?? "")}
      </AvatarFallback>
    </Avatar>
  );
}

export function UserDetail() {
  const session = useSession();

  return (
    <div className="max-w-max overflow-hidden">
      {session.status !== "loading" && (
        <div className="max-w-full text-ellipsis px-2 py-1.5">
          <p className="text-ellipsis text-start text-sm font-medium leading-none">
            {session?.data?.user?.name}
          </p>
          <p className="mt-1 text-ellipsis text-xs leading-none text-muted-foreground">
            {session?.data?.user?.email}
          </p>
        </div>
      )}
      {(session.status === "loading" ||
        session.status === "unauthenticated") && (
          <div className="grid gap-0.5 px-2 py-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        )}
    </div>
  );
}

export default function SideBarDropdown({
  shouldViewFullName = false,
  side,
  align,
}: {
  shouldViewFullName?: boolean;
  side?: "top";
  align?: "start";
}) {
  const session = useSession();
  const userId = session.data?.user.id;
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex max-w-full cursor-pointer items-center overflow-hidden rounded-md hover:bg-input">
          <UserAvatar />
          {shouldViewFullName && <UserDetail />}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align ?? "end"}
        side={side ?? "right"}
        sideOffset={5}
        alignOffset={5}
        className="w-60"
      >
        <UserDetail />
        <DropdownMenuSeparator />

        <DropdownMenuGroup className="flex flex-col gap-2 p-1">
          <DropdownMenuItem asChild>
            <ThemeToggle />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup className="flex flex-col gap-2">
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link
              href={userId ? `/user/${userId}` : ""}
              className="flex w-full items-center p-2 font-medium"
            >
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="flex w-full cursor-pointer items-center p-2 font-medium text-destructive focus:text-destructive"
            disabled={isLoggingOut}
            onSelect={async (event) => {
              event.preventDefault();
              setIsLoggingOut(true);
              document.cookie.split(";").forEach((cookie) => {
                const [name] = cookie.split("=");
                if (name) {
                  document.cookie = `${name.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
                }
              });
              await signOut();
            }}
          >
            {isLoggingOut ? (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
