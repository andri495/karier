import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
export function proxy(req:NextRequest) {
 const denied=authorize(req);if(denied)return denied;
 const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','same-origin');response.headers.set('X-Frame-Options','DENY');return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
