# Project: PCS Tracker
Web-based application for managing a Permanent Change of Station (PCS). Deployed on a local home server network (Dockerized), but requires internet access for Google OAuth and external APIs.

## Architecture
- Frontend: Fast, responsive web framework (e.g., React, Vue, or lightweight HTML/JS).
- Backend: Lightweight API (Python/FastAPI or C#/.NET utilizing Newtonsoft for JSON handling).
- Database: SQLite (local SQL). Implement application-level encryption for sensitive fields.
- Auth: Dual-Auth Model. Primary is Google OAuth (using Google profiles for family user accounts). Fallback is a single Local Admin account for offline/emergency access, driven by secure environment variables.

## Global Directives
- **Code Generation:** Output raw, functional code only. Remove all comments from the generated code.
- **UI/UX:** Design a clean, professional interface. 
- **Data Display:** Never display database Object IDs in the task management user interface.