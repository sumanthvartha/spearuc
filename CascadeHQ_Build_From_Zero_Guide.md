# CascadeHQ — Build from zero guide
### Every command, every file, every step. Start tomorrow.

---

## Step 0: Prerequisites (install these tonight)

Open your terminal and run these one by one:

```bash
# 1. Check if Node.js is installed (need v18+)
node --version

# If not installed, download from: https://nodejs.org
# Choose the LTS version (v20 or v22)

# 2. Check if Git is installed
git --version

# If not installed:
# Windows: https://git-scm.com/download/win
# Mac: brew install git
# Linux: sudo apt install git

# 3. Install VS Code if you don't have it
# Download from: https://code.visualstudio.com
```

---

## Step 1: Create accounts (do this tonight, 15 minutes)

### 1A. GitHub account
Go to github.com, sign up if you don't have an account. Create a new empty repository called `cascadehq`.

### 1B. Supabase account (your database)
Go to supabase.com, sign up with GitHub. Click "New Project." Name it `cascadehq`. Choose region: South Asia (Mumbai). Set a database password (save it somewhere safe). Wait 2 minutes for it to create. Then go to Settings > API and copy your `Project URL` and `anon public key`.

### 1C. Daily.co account (WebRTC conferencing)
Go to daily.co, sign up. Go to Developers > API Keys. Copy your API key.

### 1D. Exotel account (phone calls)
Go to exotel.com, sign up for developer account. Get your SID, API Key, and API Token from the dashboard. Buy a virtual number (costs around Rs 500-1000).

### 1E. Vercel account (hosting)
Go to vercel.com, sign up with GitHub. You'll connect your repo later.

---

## Step 2: Create the project (Day 1 morning)

Open terminal and run:

```bash
# Create the Next.js project
npx create-next-app@latest cascadehq --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Go into the project folder
cd cascadehq

# Install all the packages we need
npm install @supabase/supabase-js @daily-co/daily-js axios papaparse

# Install dev dependencies
npm install -D @types/papaparse

# Open in VS Code
code .
```

---

## Step 3: Set up environment variables

Create a file called `.env.local` in the root of your project:

```bash
# .env.local — NEVER commit this file to Git

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Daily.co
DAILY_API_KEY=your-daily-api-key-here

# Exotel
EXOTEL_SID=your-exotel-sid
EXOTEL_API_KEY=your-exotel-api-key
EXOTEL_API_TOKEN=your-exotel-api-token
EXOTEL_CALLER_ID=your-virtual-number

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 4: Create the database tables

Go to your Supabase dashboard > SQL Editor. Paste this entire SQL and click "Run":

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Organizations table
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamp with time zone default now()
);

-- Contacts table
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  phone text not null,
  group_name text default 'Default',
  channel_type text default 'webrtc' check (channel_type in ('webrtc', 'pstn')),
  created_at timestamp with time zone default now(),
  unique(org_id, phone)
);

-- Meetings table
create table meetings (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id) on delete cascade,
  title text not null,
  meeting_type text default 'broadcast' check (meeting_type in ('broadcast', 'conference')),
  status text default 'draft' check (status in ('draft', 'scheduled', 'live', 'ended')),
  target_groups text[] default '{}',
  daily_room_url text,
  daily_room_name text,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  recording_url text,
  created_at timestamp with time zone default now()
);

-- Call logs table
create table call_logs (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid references meetings(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  contact_name text,
  contact_phone text,
  channel text check (channel in ('webrtc', 'pstn')),
  status text default 'pending' check (status in ('pending', 'notified', 'ringing', 'joined', 'completed', 'missed', 'failed')),
  joined_at timestamp with time zone,
  left_at timestamp with time zone,
  duration_seconds integer default 0,
  exotel_call_sid text,
  created_at timestamp with time zone default now()
);

-- Insert a default organization
insert into organizations (name) values ('MedPharma India');

-- Insert sample contacts (replace org_id with the actual UUID from above)
-- You can do this from the app later via CSV upload
```

After running this, go to Table Editor and note the UUID of the organization that was created. You'll need it.

---

## Step 5: Create the project file structure

In VS Code, create these folders and files:

```
src/
  app/
    layout.tsx          (root layout)
    page.tsx            (login page)
    globals.css         (global styles)
    dashboard/
      page.tsx          (main dashboard)
    contacts/
      page.tsx          (contact management)
    meetings/
      new/
        page.tsx        (create meeting)
      [id]/
        live/
          page.tsx      (live meeting control)
    join/
      [id]/
        page.tsx        (public join page for users)
    api/
      contacts/
        route.ts        (contact CRUD API)
      contacts/
        upload/
          route.ts      (CSV upload API)
      meetings/
        route.ts        (meeting CRUD API)
      meetings/
        [id]/
          start/
            route.ts    (THE BIG ONE - starts the meeting)
          end/
            route.ts    (ends the meeting)
          status/
            route.ts    (live participant status)
      webhooks/
        exotel/
          route.ts      (Exotel call status webhooks)
  lib/
    supabase.ts         (database client)
    daily.ts            (Daily.co API wrapper)
    exotel.ts           (Exotel API wrapper)
```

---

## Step 6: Core library files

### src/lib/supabase.ts
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client with service role key (for API routes)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

### src/lib/daily.ts
```typescript
import axios from 'axios'

const DAILY_API_KEY = process.env.DAILY_API_KEY!
const api = axios.create({
  baseURL: 'https://api.daily.co/v1',
  headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
})

export async function createRoom(meetingId: string) {
  const res = await api.post('/rooms', {
    name: `meeting-${meetingId}`,
    properties: {
      enable_recording: 'cloud',
      max_participants: 500,
      enable_chat: false,
      start_audio_off: false,
    },
  })
  return res.data // { name, url, id }
}

export async function deleteRoom(roomName: string) {
  await api.delete(`/rooms/${roomName}`)
}

export async function getRoom(roomName: string) {
  const res = await api.get(`/rooms/${roomName}`)
  return res.data
}
```

### src/lib/exotel.ts
```typescript
import axios from 'axios'

const SID = process.env.EXOTEL_SID!
const API_KEY = process.env.EXOTEL_API_KEY!
const API_TOKEN = process.env.EXOTEL_API_TOKEN!
const CALLER_ID = process.env.EXOTEL_CALLER_ID!

const api = axios.create({
  baseURL: `https://api.exotel.com/v1/Accounts/${SID}`,
  auth: { username: API_KEY, password: API_TOKEN },
})

export async function makeCall(to: string, statusCallbackUrl: string) {
  const res = await api.post('/Calls/connect.json', null, {
    params: {
      From: CALLER_ID,
      To: to,
      CallerId: CALLER_ID,
      StatusCallback: statusCallbackUrl,
    },
  })
  return res.data // contains Call.Sid
}

export async function hangupCall(callSid: string) {
  await api.post(`/Calls/${callSid}.json`, null, {
    params: { Status: 'completed' },
  })
}
```

---

## Step 7: The most important API route — Start Meeting

### src/app/api/meetings/[id]/start/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createRoom } from '@/lib/daily'
import { makeCall } from '@/lib/exotel'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const meetingId = params.id
  const supabase = createServerClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  // 1. Get the meeting
  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single()

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }

  // 2. Get contacts for the target groups
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', meeting.org_id)
    .in('group_name', meeting.target_groups)

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts found' }, { status: 400 })
  }

  // 3. Create Daily.co room
  const room = await createRoom(meetingId)

  // 4. Update meeting status to live
  await supabase
    .from('meetings')
    .update({
      status: 'live',
      daily_room_url: room.url,
      daily_room_name: room.name,
      started_at: new Date().toISOString(),
    })
    .eq('id', meetingId)

  // 5. Split contacts by channel type
  const webrtcContacts = contacts.filter(c => c.channel_type === 'webrtc')
  const pstnContacts = contacts.filter(c => c.channel_type === 'pstn')

  // 6. Create call log entries for all contacts
  const callLogs = contacts.map(c => ({
    meeting_id: meetingId,
    contact_id: c.id,
    contact_name: c.name,
    contact_phone: c.phone,
    channel: c.channel_type,
    status: c.channel_type === 'webrtc' ? 'notified' : 'pending',
  }))
  await supabase.from('call_logs').insert(callLogs)

  // 7. For WebRTC users: they will join via the join page URL
  // In production, send push notification or SMS here:
  // SMS example: "Join meeting: https://yourapp.com/join/{meetingId}"
  // For now, they access the link manually or via SMS

  // 8. For PSTN users: call them via Exotel
  const callResults = []
  for (const contact of pstnContacts) {
    try {
      const result = await makeCall(
        contact.phone,
        `${appUrl}/api/webhooks/exotel?meetingId=${meetingId}&contactId=${contact.id}`
      )
      
      // Update call log with Exotel call SID
      await supabase
        .from('call_logs')
        .update({
          status: 'ringing',
          exotel_call_sid: result?.Call?.Sid || 'unknown',
        })
        .eq('meeting_id', meetingId)
        .eq('contact_id', contact.id)
      
      callResults.push({ phone: contact.phone, status: 'calling' })
    } catch (err) {
      // Mark as failed if Exotel call fails
      await supabase
        .from('call_logs')
        .update({ status: 'failed' })
        .eq('meeting_id', meetingId)
        .eq('contact_id', contact.id)
      
      callResults.push({ phone: contact.phone, status: 'failed' })
    }
  }

  return NextResponse.json({
    success: true,
    roomUrl: room.url,
    roomName: room.name,
    totalContacts: contacts.length,
    webrtcCount: webrtcContacts.length,
    pstnCount: pstnContacts.length,
    joinUrl: `${appUrl}/join/${meetingId}`,
    callResults,
  })
}
```

---

## Step 8: Webhook handler for Exotel

### src/app/api/webhooks/exotel/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  
  // Exotel sends form-urlencoded data
  const body = await req.formData()
  const callSid = body.get('CallSid') as string
  const status = body.get('Status') as string
  const duration = body.get('Duration') as string
  
  // Get meetingId and contactId from query params
  const meetingId = req.nextUrl.searchParams.get('meetingId')
  const contactId = req.nextUrl.searchParams.get('contactId')

  // Map Exotel status to our status
  const statusMap: Record<string, string> = {
    'ringing': 'ringing',
    'in-progress': 'joined',
    'completed': 'completed',
    'no-answer': 'missed',
    'failed': 'failed',
    'busy': 'missed',
  }

  const ourStatus = statusMap[status] || 'pending'

  // Update call log
  const updateData: any = { status: ourStatus }
  if (ourStatus === 'joined') {
    updateData.joined_at = new Date().toISOString()
  }
  if (ourStatus === 'completed' || ourStatus === 'missed' || ourStatus === 'failed') {
    updateData.left_at = new Date().toISOString()
    updateData.duration_seconds = parseInt(duration) || 0
  }

  await supabase
    .from('call_logs')
    .update(updateData)
    .eq('meeting_id', meetingId)
    .eq('contact_id', contactId)

  return NextResponse.json({ received: true })
}
```

---

## Step 9: The join page (what smartphone users see)

### src/app/join/[id]/page.tsx
```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function JoinPage({ params }: { params: { id: string } }) {
  const [meeting, setMeeting] = useState<any>(null)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')
  const callFrameRef = useRef<any>(null)

  useEffect(() => {
    // Fetch meeting details
    supabase
      .from('meetings')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(({ data }) => setMeeting(data))
  }, [params.id])

  async function joinMeeting() {
    if (!meeting?.daily_room_url) {
      setError('Meeting not started yet')
      return
    }

    try {
      // Load Daily.co SDK dynamically
      const DailyIframe = (await import('@daily-co/daily-js')).default
      
      const callFrame = DailyIframe.createFrame({
        iframeStyle: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          border: 'none',
        },
        showLeaveButton: true,
        showFullscreenButton: false,
      })
      
      callFrameRef.current = callFrame
      
      callFrame.on('left-meeting', () => {
        setJoined(false)
        callFrame.destroy()
      })

      await callFrame.join({ url: meeting.daily_room_url })
      setJoined(true)
    } catch (err) {
      setError('Failed to join meeting. Please try again.')
    }
  }

  if (!meeting) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0B0F1A', padding: 20,
      fontFamily: 'system-ui, sans-serif',
    }}>
      {!joined && (
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <h1 style={{ color: '#F1F5F9', fontSize: 20, marginBottom: 8 }}>
            {meeting.title}
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 14, marginBottom: 24 }}>
            {meeting.status === 'live' ? 'Meeting is live — tap to join' : 'Waiting for host to start'}
          </p>
          {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button
            onClick={joinMeeting}
            disabled={meeting.status !== 'live'}
            style={{
              padding: '14px 32px', borderRadius: 12, border: 'none',
              background: meeting.status === 'live'
                ? 'linear-gradient(135deg, #3B82F6, #6366F1)'
                : '#1E293B',
              color: '#fff', fontSize: 16, fontWeight: 600,
              cursor: meeting.status === 'live' ? 'pointer' : 'not-allowed',
              width: '100%',
            }}
          >
            {meeting.status === 'live' ? 'Join meeting' : 'Waiting for host...'}
          </button>
          <p style={{ color: '#64748B', fontSize: 11, marginTop: 12 }}>
            Joins via browser — no app download needed
          </p>
        </div>
      )}
    </div>
  )
}
```

---

## Step 10: Run and test

```bash
# Start the development server
npm run dev

# Open in browser
# http://localhost:3000
```

### Test sequence:
1. Open http://localhost:3000 — you should see the app
2. Go to Contacts page, add a few contacts manually
3. Go to New Meeting, create a meeting
4. Click Start — this calls your /api/meetings/[id]/start endpoint
5. Open /join/[meetingId] in another browser tab — this is what smartphone users see
6. Click "Join meeting" — you should hear audio from both tabs

---

## Step 11: Deploy to production

```bash
# Push your code to GitHub
git add .
git commit -m "Initial CascadeHQ launch"
git push origin main

# Go to vercel.com
# Click "Import Project" > select your cascadehq repo
# Add all environment variables from .env.local
# Click Deploy

# Your app is now live at: https://cascadehq.vercel.app
```

---

## Step 12: Send meeting join links to users

For MVP, send join links via SMS manually or through Exotel SMS API:

```typescript
// Add this to your start meeting API to send SMS to WebRTC users
for (const contact of webrtcContacts) {
  await axios.post(
    `https://api.exotel.com/v1/Accounts/${SID}/Sms/send`,
    null,
    {
      params: {
        From: CALLER_ID,
        To: contact.phone,
        Body: `Join meeting "${meeting.title}": ${appUrl}/join/${meetingId}`,
      },
      auth: { username: API_KEY, password: API_TOKEN },
    }
  )
}
```

---

## Quick reference: terminal commands cheat sheet

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Deploy to Vercel
vercel --prod

# Check Supabase database
# Go to: supabase.com > your project > Table Editor

# Check Daily.co rooms
# Go to: daily.co > Rooms

# Check Exotel call logs
# Go to: exotel.com > Call Logs

# Install a new package
npm install package-name

# Push code to GitHub
git add . && git commit -m "your message" && git push
```

---

## What to build on which day (summary)

Day 1: Project setup + accounts + database tables
Day 2: Auth + basic layout + navigation
Day 3-4: Contact management (add, CSV upload, groups)
Day 5: Test Daily.co room creation standalone
Day 6-7: Meeting creation form + join page
Day 8-10: Start Meeting API (the big one) + Exotel integration
Day 11: Test first hybrid meeting with 5 friends
Day 12-14: Live meeting dashboard + end meeting
Day 15-17: Analytics page + recordings
Day 18-20: SMS notifications + polish + bug fixes
Day 21: Deploy to Vercel
Day 22-25: Test with 20+ real users
Day 26-28: Fix issues from testing
Day 29-30: Demo to your customer

---

*You have everything you need. Start tomorrow. One file at a time. One API at a time. You'll have a working product in 30 days.*
