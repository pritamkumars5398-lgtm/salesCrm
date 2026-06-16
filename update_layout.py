import os

sidebar_path = "src/components/layout/Sidebar.tsx"
with open(sidebar_path, "r") as f:
    sidebar = f.read()

sidebar = sidebar.replace('background: "var(--color-bg2)"', 'background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)"')
sidebar = sidebar.replace('borderColor: "rgba(0,0,0,0.1)"', 'borderColor: "rgba(255,255,255,0.5)"')

with open(sidebar_path, "w") as f:
    f.write(sidebar)

topbar_path = "src/components/layout/Topbar.tsx"
with open(topbar_path, "r") as f:
    topbar = f.read()

topbar = topbar.replace('background: "var(--color-bg2)"', 'background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)"')
topbar = topbar.replace('borderColor: "rgba(0,0,0,0.1)"', 'borderColor: "rgba(255,255,255,0.5)"')

with open(topbar_path, "w") as f:
    f.write(topbar)

print("Layout updated with glassmorphism")
