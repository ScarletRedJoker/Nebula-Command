"use client";

import { useState } from "react";
import { Sidebar, MobileSidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { CommandPalette } from "@/components/command-palette";

export default function AIStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MobileSidebar open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <CommandPalette />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-auto bg-background p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
