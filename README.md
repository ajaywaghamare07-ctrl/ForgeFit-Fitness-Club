# ForgeFit — Full-stack Fitness Club MVP

A full-stack fitness club management app with **separate Admin and Member portals**.

## Requirements
- Node.js 18 or newer
- VS Code (recommended)

## Run in VS Code
1. Extract the ZIP.
2. Open the `ForgeFit_FullStack` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000` in your browser.

## Demo logins
**Admin portal**
- URL: `http://localhost:3000/admin/login`
- Email: `admin@forgefit.local`
- Password: `ChangeMe123!`

**Member portal**
- URL: `http://localhost:3000/member/login`
- Email: `rohan@demo.local`
- Password: `Member123!`

Other seeded demo members:
- `priya@demo.local` / `Member123!`
- `arjun@demo.local` / `Member123!`

## Included features

### Admin portal
- Separate admin login and session role
- Dashboard with member, active membership, check-in and revenue stats
- Create member accounts with a temporary password
- Member list with plan and status
- Attendance history
- Membership plan overview
- Payment records

### Member portal
- Separate member login
- Personal dashboard
- Membership and validity dates
- Total attendance count
- Member check-in (only with an active membership)
- Personal attendance history
- Weekly workout guide with exercise logging (sets, reps and optional weight)
- Recent exercise history and last-seven-days dashboard totals
- Profile page

## Backend and database
- Node.js + Express
- SQLite database stored in `data/forgefit.db`
- Passwords hashed with bcryptjs
- Server-side sessions stored in SQLite
- Member, plan, membership, attendance and payment tables
- Exercise logs stored in SQLite
- Demo seed data is created automatically on first run

## Important demo notes
- This is a local academic MVP, not a production-ready commercial service.
- Change the default admin password and `SESSION_SECRET` before any public deployment.
- Payment records are demo records; there is no real payment gateway.
- Workout routines are sample content, not individualized medical or training advice.
- The database file is created automatically when the server starts.
- To reset demo data, stop the server and delete the `data` folder, then run `npm start` again.
