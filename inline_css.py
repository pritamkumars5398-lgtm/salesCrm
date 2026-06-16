import os
import re

# We will replace className="btn ..." or className="card" etc with tailwind classes
class_map = {
    r'\bcard-header\b': 'flex items-center justify-between px-5 py-4 border-b border-slate-100/80 bg-white/50',
    r'\bcard-title\b': 'text-[14.5px] font-bold flex items-center gap-2.5 text-slate-800 tracking-tight',
    r'\bcard-body\b': 'px-5 py-5',
    r'\bcard\b(?!-)': 'bg-white/80 backdrop-blur-md border border-white rounded-[20px] shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.01),inset_0_1px_0_rgba(255,255,255,0.8)] mb-4 overflow-hidden',
    
    r'\bform-input\b': 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none shadow-sm transition-all duration-200 focus:border-indigo-600 focus:shadow-[0_0_0_3px_rgba(79,70,229,0.15)] placeholder:text-slate-400',
    
    r'\bpill-green\b': 'bg-emerald-50 text-emerald-600',
    r'\bpill-amber\b': 'bg-amber-50 text-amber-600',
    r'\bpill-blue\b': 'bg-blue-50 text-blue-600',
    r'\bpill-red\b': 'bg-red-50 text-red-600',
    r'\bpill-purple\b': 'bg-purple-50 text-purple-600',
    r'\bpill-gray\b': 'bg-slate-50 text-slate-600',
    r'\bpill-manual\b': 'bg-red-50 text-red-600',
    r'\bpill\b(?!-)': 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase shadow-sm border border-black/5',

    # Buttons - we need to be careful with overlapping btn-sm, btn-ghost etc.
    # It's better to replace them in order: btn-accent, btn-ghost, btn-sm, btn
    r'\bbtn-accent\b': 'bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white shadow-[0_4px_14px_0_rgba(79,70,229,0.3)] hover:shadow-[0_6px_20px_0_rgba(79,70,229,0.4)] hover:brightness-105',
    r'\bbtn-ghost\b': '!bg-transparent !border-transparent !text-slate-500 !shadow-none hover:!bg-slate-100 hover:!text-slate-900',
    r'\bbtn-sm\b': '!px-3 !py-[7px] !text-xs !rounded-lg',
    r'\bbtn\b(?!-)': 'inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:bg-slate-50 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]',
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    # For toggles, it's safer to just let them be, or replace them manually if needed. The user didn't explicitly delete the wa-bubble/tog CSS, wait, they DID delete it from globals.css!
    # So we MUST replace tog and wa-bubble. Let's do that via another script if needed.
    
    # We only want to replace inside className="..."
    # A simple regex for classNames:
    def replace_classes(match):
        classes = match.group(1)
        # Apply all map replacements
        for pat, repl in class_map.items():
            classes = re.sub(pat, repl, classes)
        # Also clean up multiple spaces
        classes = re.sub(r'\s+', ' ', classes).strip()
        return f'className="{classes}"'
        
    new_content = re.sub(r'className="([^"]+)"', replace_classes, new_content)
    # Also support className={`...`}
    def replace_dynamic_classes(match):
        classes = match.group(1)
        for pat, repl in class_map.items():
            classes = re.sub(pat, repl, classes)
        return f'className={{`{classes}`}}'
        
    new_content = re.sub(r'className=\{\`([^\`]+)\`\}', replace_dynamic_classes, new_content)

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            process_file(os.path.join(root, file))
