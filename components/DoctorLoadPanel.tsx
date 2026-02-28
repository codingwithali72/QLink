"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Activity, UserCheck, Clock } from "lucide-react";

interface Doctor {
    id: string;
    name: string;
    specialization?: string;
}

interface Token {
    id: string;
    status: string;
    doctorId?: string | null;
    tokenNumber: number;
    isPriority?: boolean;
}

interface DoctorLoadPanelProps {
    doctors: Doctor[];
    tokens: Token[];
    className?: string;
}

/**
 * DoctorLoadPanel
 * 
 * Displays real-time queue load per doctor.
 * Allows receptionist to visualize which doctors are busiest
 * at a glance for intelligent token routing.
 */
export function DoctorLoadPanel({ doctors, tokens, className }: DoctorLoadPanelProps) {
    const doctorLoads = useMemo(() => {
        return doctors.map((doc) => {
            const assigned = tokens.filter(t => t.doctorId === doc.id);
            const waiting = assigned.filter(t => t.status === 'WAITING').length;
            const serving = assigned.filter(t => t.status === 'SERVING').length;
            const total = waiting + serving;

            const loadLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
                total === 0 ? 'LOW' :
                    total <= 5 ? 'MEDIUM' : 'HIGH';

            return { ...doc, waiting, serving, total, loadLevel };
        });
    }, [doctors, tokens]);

    if (doctors.length === 0) return null;

    return (
        <div className={cn("bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4", className)}>
            <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Doctor Load</h3>
            </div>
            <div className="space-y-2">
                {doctorLoads.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-3 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className={cn(
                                "w-2 h-2 rounded-full flex-shrink-0",
                                doc.loadLevel === 'LOW' && "bg-green-500",
                                doc.loadLevel === 'MEDIUM' && "bg-yellow-500",
                                doc.loadLevel === 'HIGH' && "bg-red-500 animate-pulse"
                            )} />
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate font-medium">
                                {doc.name.replace("Dr. ", "Dr.")}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {doc.serving > 0 && (
                                <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                                    <UserCheck className="w-3 h-3" />
                                    In
                                </span>
                            )}
                            <span className={cn(
                                "flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded",
                                doc.loadLevel === 'LOW' && "text-green-700 bg-green-100 dark:bg-green-900/30",
                                doc.loadLevel === 'MEDIUM' && "text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30",
                                doc.loadLevel === 'HIGH' && "text-red-700 bg-red-100 dark:bg-red-900/30"
                            )}>
                                <Clock className="w-3 h-3" />
                                {doc.waiting} waiting
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
