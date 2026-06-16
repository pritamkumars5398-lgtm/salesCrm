import os

files = {
    'src/components/pages/CRM.tsx': [('rgba(255,255,255,0.2)', 'rgba(0,0,0,0.2)')],
    'src/components/pages/Crons.tsx': [('rgba(255,255,255,0.04)', 'rgba(0,0,0,0.05)')]
}

for filepath, replacements in files.items():
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Updated {filepath}")
