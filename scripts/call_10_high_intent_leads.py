import urllib.request
import urllib.parse
import json
import base64
import time
from datetime import datetime

auth_id = 'MAMDE2YTGYZDQTMGFMNS'
auth_token = 'ZDU5ZTIxOGMtYmE2NS00MDU0LTcwNTEtMDk5ZDBk'
from_number = '918065535939'

creds = base64.b64encode(f'{auth_id}:{auth_token}'.encode()).decode()

leads = [
    {
        "id": "6ad8774cf523ae46bc86fccc",
        "company": "Agarwal Estates",
        "phone": "918123301122",
        "category": "real_estate"
    },
    {
        "id": "6ad8774cf523ae46bc86fcd0",
        "company": "Address Advisors",
        "phone": "918792926457",
        "category": "real_estate"
    },
    {
        "id": "6ad8774cf523ae46bc86fcd4",
        "company": "100 Yards Property Consultants",
        "phone": "919916866667",
        "category": "real_estate"
    },
    {
        "id": "6ad8774cf523ae46bc86fcd8",
        "company": "Prop Road Consultants",
        "phone": "919019849801",
        "category": "real_estate"
    },
    {
        "id": "6ad8774cf523ae46bc86fcdc",
        "company": "CARJAX Auto Care",
        "phone": "918073457258",
        "category": "auto_detailing"
    },
    {
        "id": "6ad8774df523ae46bc86fce0",
        "company": "The Detailing Mafia Yelahanka",
        "phone": "919500320905",
        "category": "auto_detailing"
    },
    {
        "id": "6ad8774df523ae46bc86fce4",
        "company": "Professional Movers & Packers",
        "phone": "919351166155",
        "category": "logistics"
    },
    {
        "id": "6ad8774df523ae46bc86fce8",
        "company": "Allwins Packers and Cargo Movers",
        "phone": "919591117117",
        "category": "logistics"
    },
    {
        "id": "6ad8774df523ae46bc86fcec",
        "company": "Elite IIT",
        "phone": "917760763337",
        "category": "coaching"
    },
    {
        "id": "6ad8774df523ae46bc86fcf0",
        "company": "Ideal Centre for Educare",
        "phone": "919740808712",
        "category": "coaching"
    }
]

print("="*75)
print(f"DISPATCHING 10 HIGH-INTENT SOUTH INDIA OUTBOUND CALLS VIA PLIVO (+{from_number})")
print("Target Niches: Real Estate, Auto Detailing, Logistics, Coaching Institutes")
print("="*75)

dispatched = []

for i, lead in enumerate(leads, 1):
    comp_enc = urllib.parse.quote(lead['company'])
    cat_enc = urllib.parse.quote(lead['category'])
    answer_url = f"https://pleadingly-nonfortifiable-tyron.ngrok-free.dev/api/calls/south-services-pitch?company={comp_enc}&category={cat_enc}"
    
    payload = {
        "from": from_number,
        "to": lead["phone"],
        "answer_url": answer_url,
        "answer_method": "POST",
        "ring_timeout": 25,
        "time_limit": 120
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"https://api.plivo.com/v1/Account/{auth_id}/Call/", data=data, method="POST")
    req.add_header("Authorization", f"Basic {creds}")
    req.add_header("Content-Type", "application/json")
    
    print(f"[{i}/10] Dialing {lead['company']} (+{lead['phone']}) [{lead['category']}]...")
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode())
            req_uuid = res.get("request_uuid")
            print(f"   -> Plivo Queued: {req_uuid}")
            dispatched.append({**lead, "request_uuid": req_uuid, "status": "queued"})
    except Exception as e:
        print(f"   -> Plivo Error: {e}")
        dispatched.append({**lead, "request_uuid": None, "error": str(e)})
        
    if i < len(leads):
        print("   Pausing 18s before next call...\n")
        time.sleep(18)

print("\nAll 10 calls dispatched. Waiting 30 seconds for carriers to complete calls and finalize CDRs...")
time.sleep(30)

# Fetch CDRs
cdr_req = urllib.request.Request(f"https://api.plivo.com/v1/Account/{auth_id}/Call/?limit=20")
cdr_req.add_header("Authorization", f"Basic {creds}")

cdrs_by_phone = {}
try:
    with urllib.request.urlopen(cdr_req) as resp:
        cdrs = json.loads(resp.read().decode()).get("objects", [])
        for c in cdrs:
            to = c.get("to_number", "").replace("+", "")
            if to not in cdrs_by_phone:
                cdrs_by_phone[to] = c
except Exception as e:
    print("Error fetching CDRs:", e)

print("\n" + "="*75)
print("FINAL CARRIER CALL DETAIL RECORDS (CDRs):")
print("="*75)

final_results = []
for d in dispatched:
    phone = d["phone"]
    cdr = cdrs_by_phone.get(phone)
    if cdr:
        state = cdr.get("call_state", "UNKNOWN")
        dur = cdr.get("call_duration", 0)
        hangup = cdr.get("hangup_cause_name", "N/A")
        src = cdr.get("hangup_source", "N/A")
        print(f"Company: {d['company']} [{d['category']}]")
        print(f"Phone: +{phone}")
        print(f"Status: {state} | Duration: {dur}s | Hangup: {hangup} ({src})")
        print("-" * 50)
        final_results.append({**d, "state": state, "duration": dur, "hangup": hangup, "cdr": cdr})
    else:
        print(f"Company: {d['company']} | Phone: +{phone} | Status: Processing or No CDR yet")
        print("-" * 50)
        final_results.append({**d, "state": "PROCESSING", "duration": 0, "hangup": "N/A"})

# Write results to json for DB sync
with open("/Users/rajesh/Documents/salesCrm/scripts/last_10_call_results.json", "w") as f:
    json.dump(final_results, f, indent=2)

print("\nResults exported to /Users/rajesh/Documents/salesCrm/scripts/last_10_call_results.json")
