import os
import re

filepath = 'src/components/drawer/WAConvo.tsx'
with open(filepath, 'r') as f:
    content = f.read()

new_content = content.replace('#e9fffa', '#111111')

if new_content != content:
    with open(filepath, 'w') as f:
        f.write(new_content)
    print("Updated WAConvo.tsx")
