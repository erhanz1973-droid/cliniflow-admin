# Cliniflow Backend API

Backend API server for Cliniflow platform.

## Structure

```
backend/
├── index.cjs          # Main Express server
├── lib/               # Utility libraries
├── shared/            # Shared modules (procedures, etc.)
├── data/              # JSON database files
└── public/            # Static files (temporary - legacy admin panels)
```

## Environment Variables

See `render.yaml` for required environment variables.

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm install
npm start
```

## API Base URL

For frontend applications, use:
- Development: `http://localhost:5050`
- Production: Set via `NEXT_PUBLIC_API_URL` in admin/superadmin

## Notes

- Static HTML files in `public/` are legacy admin panels
- They will be removed once new Next.js frontends are ready
- Backend only serves API endpoints, no frontend
