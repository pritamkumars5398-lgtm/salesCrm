import urllib.request
import urllib.parse
import http.cookiejar
import json
import time
import base64

base_url = "http://localhost:3000"
agent_id = "6a50784535696ad592bf6634"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# 1. Login to Sales CRM
print("Logging in to Sales CRM as dsales@gmail.com...")
login_payload = json.dumps({"email": "dsales@gmail.com", "password": "123456"}).encode("utf-8")
login_req = urllib.request.Request(f"{base_url}/api/auth/login", data=login_payload, method="POST")
login_req.add_header("Content-Type", "application/json")

try:
    with opener.open(login_req) as resp:
        user_data = json.loads(resp.read().decode())
        print(f"Logged in successfully as {user_data.get('name')} ({user_data.get('email')})")
except Exception as e:
    print("Login failed:", e)
    exit(1)

leads = [
    {
        "name": "Ideal Centre for Educare",
        "phone": "+919740808712",
        "category": "Coaching & Test Prep",
        "offer": "Student Mobile App + WhatsApp Fee/Admission Bot"
    },
    {
        "name": "Elite IIT",
        "phone": "+917760763337",
        "category": "Coaching & Test Prep",
        "offer": "Branded Test Series Mobile App + AI Lead Bot"
    },
    {
        "name": "Allwins Packers and Cargo Movers",
        "phone": "+919591117117",
        "category": "Logistics & Movers",
        "offer": "Instant WhatsApp Quotation Bot + Booking Web Engine"
    },
    {
        "name": "CARJAX Auto Care",
        "phone": "+918073457258",
        "category": "Premium Car Detailing",
        "offer": "Customer Slot Booking Mobile App + Service Reminder Bot"
    },
    {
        "name": "The Detailing Mafia Yelahanka",
        "phone": "+919500320905",
        "category": "Ceramic Coating Studio",
        "offer": "Ceramic Warranty Portal + Service App"
    }
]

print("\n" + "="*75)
print("DISPATCHING 5 HIGH-CONVERSION 2-WAY AI VOICE CALLS (SALES CRM)")
print("Natural Pattern Interrupt + Value Proposition Active (No 'Ji Bilkul' / No Unsolicited Brand Drop)")
print("="*75)

call_records = []

for i, lead in enumerate(leads, 1):
    payload = json.dumps({
        "agentId": agent_id,
        "testNumber": lead["phone"]
    }).encode("utf-8")
    
    req = urllib.request.Request(f"{base_url}/api/voice/call-test", data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    
    print(f"\n[{i}/5] Calling {lead['name']} ({lead['phone']}) — [{lead['category']}]...")
    try:
        with opener.open(req) as resp:
            data = json.loads(resp.read().decode())
            call_id = data.get("callId")
            print(f"   -> AI Call Dispatched via Plivo! Call ID: {call_id}")
            call_records.append({"lead": lead, "callId": call_id, "success": True})
    except Exception as e:
        print(f"   -> Call Dispatch Error: {e}")
        call_records.append({"lead": lead, "callId": None, "success": False, "error": str(e)})
        
    if i < len(leads):
        print("   Waiting 25 seconds for call progression before dialing next lead...")
        time.sleep(25)

print("\nAll 5 AI calls initiated. Waiting 30 seconds for all conversations to conclude and recordings to finalize...")
time.sleep(30)

print("\n" + "="*75)
print("FETCHING FINAL CARRIER CALL DETAILS, RECORDINGS & OUTCOMES:")
print("="*75)

auth_id = 'MAMDE2YTGYZDQTMGFMNS'
auth_token = 'ZDU5ZTIxOGMtYmE2NS00MDU0LTcwNTEtMDk5ZDBk'
creds = base64.b64encode(f'{auth_id}:{auth_token}'.encode()).decode()

cdr_req = urllib.request.Request(f'https://api.plivo.com/v1/Account/{auth_id}/Call/?limit=15')
cdr_req.add_header('Authorization', f'Basic {creds}')
cdrs_by_to = {}
try:
    with urllib.request.urlopen(cdr_req) as resp:
        c_data = json.loads(resp.read().decode())
        for c in c_data.get('objects', []):
            to = c.get('to_number', '').replace('+', '')
            if to not in cdrs_by_to:
                cdrs_by_to[to] = c
except Exception as e:
    print('Error fetching Plivo CDRs:', e)

rec_req = urllib.request.Request(f'https://api.plivo.com/v1/Account/{auth_id}/Recording/?limit=15')
rec_req.add_header('Authorization', f'Basic {creds}')
recs_by_call = {}
try:
    with urllib.request.urlopen(rec_req) as resp:
        r_data = json.loads(resp.read().decode())
        for r in r_data.get('objects', []):
            recs_by_call[r.get('call_uuid')] = r
except Exception as e:
    print('Error fetching Plivo Recordings:', e)

for item in call_records:
    lead = item["lead"]
    clean_to = lead["phone"].replace("+", "")
    cdr = cdrs_by_to.get(clean_to)
    
    print(f"Company: {lead['name']} [{lead['category']}]")
    print(f"Phone: {lead['phone']}")
    if cdr:
        state = cdr.get("call_state")
        dur = cdr.get("call_duration", 0)
        hangup = cdr.get("hangup_cause_name", "N/A")
        src = cdr.get("hangup_source", "N/A")
        call_uuid = cdr.get("call_uuid")
        print(f"Carrier Status: {state} | Duration: {dur}s | Hangup: {hangup} ({src})")
        rec = recs_by_call.get(call_uuid)
        if rec:
            print(f"Recording: {rec.get('recording_url')}")
        else:
            print("Recording: No audio recording generated (call duration < 1s or rejected)")
    else:
        print("Status: Call processing or No CDR record returned")
    print("-" * 60)
