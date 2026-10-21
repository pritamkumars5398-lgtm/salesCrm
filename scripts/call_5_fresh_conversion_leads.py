import urllib.request
import urllib.parse
import json
import base64
import time

auth_id = 'MAMDE2YTGYZDQTMGFMNS'
auth_token = 'ZDU5ZTIxOGMtYmE2NS00MDU0LTcwNTEtMDk5ZDBk'
from_number = '918065535939'

creds = base64.b64encode(f'{auth_id}:{auth_token}'.encode()).decode()

fresh_leads = [
    {
        "id": "6ad8998d72e19501706e624d",
        "company": "The Aesthetic Edge",
        "phone": "917795426464",
        "category": "clinic",
        "offer": "24/7 WhatsApp Appointment Booking & Patient CRM"
    },
    {
        "id": "6ad8998d72e19501706e6251",
        "company": "Excellence Dental",
        "phone": "919686039281",
        "category": "clinic",
        "offer": "Patient Booking App & Automated Recall Bot"
    },
    {
        "id": "6ad8998d72e19501706e6255",
        "company": "Esperto Car Care",
        "phone": "919663262526",
        "category": "auto_detailing",
        "offer": "Service Slot Booking App & Ceramic Maintenance Bot"
    },
    {
        "id": "6ad8998e72e19501706e6259",
        "company": "The Detailing Mafia Koramangala",
        "phone": "919035370777",
        "category": "auto_detailing",
        "offer": "Digital Warranty Card & Booking System"
    },
    {
        "id": "6ad8998e72e19501706e625d",
        "company": "Mantra Cargo Packers",
        "phone": "919572515050",
        "category": "logistics",
        "offer": "Instant WhatsApp Quotation Bot & Web Engine"
    }
]

print("="*75)
print("CALLING 5 FRESH HIGH-CONVERSION BANGALORE BUSINESSES (+91 80 6553 5939)")
print("Tailored Conversion Pitch + Keypad 1 WhatsApp Handoff + Full Audio Recording")
print("="*75)

dispatched = []

for i, lead in enumerate(fresh_leads, 1):
    comp_enc = urllib.parse.quote(lead['company'])
    cat_enc = urllib.parse.quote(lead['category'])
    answer_url = f"https://pleadingly-nonfortifiable-tyron.ngrok-free.dev/api/calls/south-services-pitch?company={comp_enc}&category={cat_enc}"
    
    payload = {
        "from": from_number,
        "to": lead["phone"],
        "answer_url": answer_url,
        "answer_method": "POST",
        "ring_timeout": 25,
        "time_limit": 120,
        "record": "true",
        "record_direction": "both"
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"https://api.plivo.com/v1/Account/{auth_id}/Call/", data=data, method="POST")
    req.add_header("Authorization", f"Basic {creds}")
    req.add_header("Content-Type", "application/json")
    
    print(f"\n[{i}/5] Dialing {lead['company']} (+{lead['phone']}) [{lead['category']}]...")
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode())
            req_uuid = res.get("request_uuid")
            print(f"   -> Plivo Queued: {req_uuid}")
            dispatched.append({**lead, "request_uuid": req_uuid, "status": "queued"})
    except Exception as e:
        print(f"   -> Plivo Error: {e}")
        dispatched.append({**lead, "request_uuid": None, "error": str(e)})
        
    if i < len(fresh_leads):
        print("   Pausing 20s before dialing next lead...")
        time.sleep(20)

print("\nAll 5 calls dispatched. Waiting 30 seconds for calls to finalize and carrier recordings to generate...")
time.sleep(30)

# Fetch CDRs
cdr_req = urllib.request.Request(f"https://api.plivo.com/v1/Account/{auth_id}/Call/?limit=15")
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

# Fetch Recordings
rec_req = urllib.request.Request(f"https://api.plivo.com/v1/Account/{auth_id}/Recording/?limit=15")
rec_req.add_header("Authorization", f"Basic {creds}")

recs_by_call = {}
try:
    with urllib.request.urlopen(rec_req) as resp:
        recs = json.loads(resp.read().decode()).get("objects", [])
        for r in recs:
            recs_by_call[r.get("call_uuid")] = r
except Exception as e:
    print("Error fetching Recordings:", e)

print("\n" + "="*75)
print("FINAL CARRIER CALL DETAIL RECORDS (CDRs) & AUDIO RECORDINGS:")
print("="*75)

final_results = []
for d in dispatched:
    phone = d["phone"]
    cdr = cdrs_by_phone.get(phone)
    call_uuid = cdr.get("call_uuid") if cdr else d.get("request_uuid")
    rec = recs_by_call.get(call_uuid)
    rec_url = rec.get("recording_url") if rec else None
    
    if cdr:
        state = cdr.get("call_state", "UNKNOWN")
        dur = cdr.get("call_duration", 0)
        hangup = cdr.get("hangup_cause_name", "N/A")
        src = cdr.get("hangup_source", "N/A")
        print(f"Company: {d['company']} [{d['category']}]")
        print(f"Phone: +{phone}")
        print(f"Status: {state} | Duration: {dur}s | Hangup: {hangup} ({src})")
        if rec_url:
            print(f"Recording MP3: {rec_url}")
        else:
            print("Recording: No recording generated (unanswered / busy)")
        print("-" * 50)
        final_results.append({**d, "state": state, "duration": dur, "hangup": hangup, "recordingUrl": rec_url})
    else:
        print(f"Company: {d['company']} | Phone: +{phone} | Status: Processing or No CDR yet")
        print("-" * 50)
        final_results.append({**d, "state": "PROCESSING", "duration": 0, "hangup": "N/A", "recordingUrl": None})

# Write results for DB sync
with open("/Users/rajesh/Documents/salesCrm/scripts/last_fresh_5_results.json", "w") as f:
    json.dump(final_results, f, indent=2)

print("\nResults exported to /Users/rajesh/Documents/salesCrm/scripts/last_fresh_5_results.json")
