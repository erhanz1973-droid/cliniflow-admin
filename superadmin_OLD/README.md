# Cliniflow SuperAdmin Panel

SuperAdmin dashboard built with Next.js.

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:5050)

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser (different port from admin).

## Production

```bash
npm run build
npm start
```

## Render Deployment

Set `NEXT_PUBLIC_API_URL` to your backend API URL in Render environment variables.

Build Command: `npm run build`
Start Command: `npm start`

## Important Notes

- SuperAdmin panel only displays **statistics and metrics**
- **No patient content** is shown
- **No message content** is shown
- Only clinic-level aggregations and counts
