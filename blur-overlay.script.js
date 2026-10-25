
import { h, render, html, useState, useEffect, useRef } from "./vendor/preact-standalone.module.js";

function BlurOverlay() {
    const [state, setState] = useState({ visible: false, description: "", rect: null });
    const rafRef = useRef(null);
    const videoRef = useRef(null);

    useEffect(() => {
        window.__nazafaBlurOverlay = {
            show(video, description) {
                videoRef.current = video;
                setState({ visible: true, description: description || "محتوى غير مناسب", rect: video.getBoundingClientRect() });

                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                const loop = () => {
                    if (!videoRef.current) return;
                    setState(prev => (prev.visible ? { ...prev, rect: videoRef.current.getBoundingClientRect() } : prev));
                    rafRef.current = requestAnimationFrame(loop);
                };
                rafRef.current = requestAnimationFrame(loop);
            },
            hide() {
                if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                }
                videoRef.current = null;
                setState({ visible: false, description: "", rect: null });
            }
        };
        return () => { delete window.__nazafaBlurOverlay; };
    }, []);

    if (!state.visible || !state.rect) return null;

    const r = state.rect;
    return html`
        <div id="nazafa-blur-overlay" style=${{
            position: "fixed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "16px",
            background: "rgba(15, 23, 42, 0.55)",
            color: "#fff",
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            fontSize: "15px",
            fontWeight: 600,
            lineHeight: 1.6,
            zIndex: 2147483647,
            pointerEvents: "none",
            direction: "rtl",
            boxSizing: "border-box",
            top: `${r.top}px`,
            left: `${r.left}px`,
            width: `${r.width}px`,
            height: `${r.height}px`
        }}>${state.description}</div>
    `;
}

const nazafaBlurOverlayMount = document.createElement("div");
nazafaBlurOverlayMount.id = "nazafa-blur-overlay-root";
(document.body || document.documentElement).appendChild(nazafaBlurOverlayMount);
render(html`<${BlurOverlay} />`, nazafaBlurOverlayMount);
