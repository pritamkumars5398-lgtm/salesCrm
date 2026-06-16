import os
import re

replacements = {
    r'rgba\(255,255,255,0\.07\)': 'rgba(0,0,0,0.1)',
    r'rgba\(255,255,255,0\.12\)': 'rgba(0,0,0,0.15)',
    r'rgba\(255,255,255,0\.06\)': 'rgba(0,0,0,0.08)',
    r'rgba\(255,255,255,0\.45\)': 'rgba(0,0,0,0.45)',
    r'#8888a0': 'var(--color-text2)',
    r'#e8e8f0': 'var(--color-text)',
    r'#55556a': 'var(--color-text3)',
    r'#8b83ff': 'var(--color-accent2)',
    r'#1c1c24': 'var(--color-bg3)',
    r'#16161c': 'var(--color-bg2)',
    r'#22222d': 'var(--color-bg4)',
    r'#0f0f12': 'var(--color-bg)',
    r'#1f2c34': '#ffffff',
    r'#005c4b': '#dcf8c6',
    r'#1a2530': 'var(--color-bg4)',
    r'#0d1117': 'var(--color-bg2)',
    r'#2a2a35': 'var(--color-bg3)',
    r'text-\[#8888a0\]': 'text-[var(--color-text2)]',
    r'text-\[#e8e8f0\]': 'text-[var(--color-text)]',
    r'text-\[#8b83ff\]': 'text-[var(--color-accent2)]',
    r'bg-\[#1c1c24\]': 'bg-[var(--color-bg3)]',
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    for pattern, repl in replacements.items():
        new_content = re.sub(pattern, repl, new_content)
        
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts', '.css')):
            process_file(os.path.join(root, file))
