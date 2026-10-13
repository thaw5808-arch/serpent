"use client";
import type { DoctorCard } from "./doctorCard";
import { DOCTOR_CARDS, transact } from "./history";

/*
 * Doctor cards live in this browser's IndexedDB only (the History database), and
 * are kept even when "Save my results" is off: losing a bite time and symptom
 * times mid-emergency would be worse. Nothing is ever uploaded. Every call
 * catches its own errors: reads give null, writes give false.
 */

export async function getDoctorCard(id: string): Promise<DoctorCard | null> {
  try {
    return await transact([DOCTOR_CARDS], "readonly", (tx) => {
      const req = tx.objectStore(DOCTOR_CARDS).get(id);
      return () => (req.result as DoctorCard | undefined) ?? null;
    });
  } catch {
    return null;
  }
}

export async function saveDoctorCard(card: DoctorCard): Promise<boolean> {
  try {
    await transact([DOCTOR_CARDS], "readwrite", (tx) => {
      tx.objectStore(DOCTOR_CARDS).put(card);
      return () => undefined;
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteDoctorCard(id: string): Promise<boolean> {
  try {
    await transact([DOCTOR_CARDS], "readwrite", (tx) => {
      tx.objectStore(DOCTOR_CARDS).delete(id);
      return () => undefined;
    });
    return true;
  } catch {
    return false;
  }
}
