import os
import re

class_map = {
    r'\btog\b(?!-)': 'relative w-11 h-6 shrink-0',
    r'\btog-slider\b': 'absolute inset-0 bg-slate-300 rounded-full cursor-pointer transition-colors duration-300 ease-in-out border border-black/5 shadow-inner peer-checked:bg-emerald-500 peer-checked:border-transparent before:content-[\'\'] before:absolute before:w-[18px] before:h-[18px] before:left-[2px] before:top-[2px] before:bg-white before:rounded-full before:transition-transform before:duration-300 before:ease-in-out before:shadow-sm peer-checked:before:translate-x-[20px]',
    r'\bwa-bubble-sent\b': 'bg-[#dcf8c6] text-emerald-900 rounded-br-none rounded-xl shadow-sm',
    r'\bwa-bubble-recv\b': 'bg-white text-slate-900 rounded-bl-none rounded-xl shadow-sm',
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    
    def replace_classes(match):
        classes = match.group(1)
        for pat, repl in class_map.items():
            classes = re.sub(pat, repl, classes)
        classes = re.sub(r'\s+', ' ', classes).strip()
        return f'className="{classes}"'
        
    new_content = re.sub(r'className="([^"]+)"', replace_classes, new_content)
    
    def replace_dynamic_classes(match):
        classes = match.group(1)
        for pat, repl in class_map.items():
            classes = re.sub(pat, repl, classes)
        return f'className={{`{classes}`}}'
        
    new_content = re.sub(r'className=\{\`([^\`]+)\`\}', replace_dynamic_classes, new_content)

    # Convert the inputs inside toggles to use the "peer sr-only" classes
    # We look for `<input type="checkbox"` that are inside a toggle context (we just replace all toggle inputs)
    # Actually, a simple text replace is enough since they are formatted consistently.
    new_content = re.sub(r'<input\s+type="checkbox"(.*?)/>', r'<input type="checkbox" className="peer sr-only"\1/>', new_content)
    
    # Also fix WA bubbles border radii if they are hardcoded
    # We already added rounded-br-none and rounded-xl to wa-bubble-sent
    # Remove any borderBottomRightRadius from style={{...}}
    new_content = re.sub(r',\s*borderBottomRightRadius:\s*3', '', new_content)
    new_content = re.sub(r',\s*borderBottomLeftRadius:\s*3', '', new_content)

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            process_file(os.path.join(root, file))
