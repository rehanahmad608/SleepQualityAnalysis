"""Serve the built React app from frontend/dist and proxy /api to the FastAPI backend.

Node.js is not required. Run: python serve_frontend.py
"""
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BACKEND = "http://127.0.0.1:8000"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = FastAPI()


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_api(path: str, request: Request):
    url = f"{BACKEND}/api/{path}"
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.request(
            request.method,
            url,
            params=dict(request.query_params),
            content=body,
            headers=headers,
        )
    excluded = {"content-encoding", "content-length", "transfer-encoding", "connection"}
    resp_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
    return Response(content=resp.content, status_code=resp.status_code, headers=resp_headers)


app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{full_path:path}")
async def spa(full_path: str):
    file = DIST / full_path
    if full_path and file.is_file():
        return FileResponse(file)
    return FileResponse(DIST / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5173)
