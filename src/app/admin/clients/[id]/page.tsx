"use client";
import { use } from "react";
import AdminClient from "@/components/admin/AdminClient";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminClient id={id} />;
}
