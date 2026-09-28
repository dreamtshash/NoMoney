from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.pdfencrypt import StandardEncryption

W,H = A4

def hdfc(path, enc=None):
    """HDFC-style: Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance.
    Wrapped narrations, 2 pages, header repeated, right-aligned numbers."""
    c = canvas.Canvas(path, pagesize=A4, encrypt=enc)
    rows = [
        ("01/09/26","SALARY SEP 2026 ACME TECH PVT LTD","NEFT00123","01/09/26",None,"35,000.00"),
        ("02/09/26","UPI-SWIGGY-swiggy@icici-ORDER 88213 FOOD DELIVERY","UPI4412","02/09/26","412.00",None),
        ("03/09/26","ATW-512967XXXXXX1234-S1ANBG02-BANGALORE","000451","03/09/26","2,000.00",None),
        ("05/09/26","POS 4312XXXXXXXX9981 RELIANCE SMART","POS9912","05/09/26","1,850.50",None),
        ("06/09/26","IMPS-RAHUL SHARMA-SPLIT DINNER","IMPS5521","06/09/26",None,"1,000.00"),
        ("08/09/26","NEFT DR-HDFC0001-RENT SEPTEMBER-LANDLORD NAME","N1234","08/09/26","12,000.00",None),
        ("10/09/26","REFUND AMAZON ORDER 403-1123","RF7781","10/09/26",None,"899.00"),
    ]
    rows2 = [
        ("14/09/26","UPI-ZEPTO-zepto@ybl-GROCERIES","UPI7788","14/09/26","640.00",None),
        ("20/09/26","TRANSFER TO SAVINGS A/C XX4521","TRF0001","20/09/26","10,000.00",None),
        ("25/09/26","INTEREST CREDIT","INT0925","25/09/26",None,"112.40"),
    ]
    xs = dict(date=40, narr=95, ref=300, vdt=360, wd=470, dep=530, bal=585)
    def header(y):
        c.setFont("Helvetica-Bold", 8)
        c.drawString(xs["date"], y, "Date"); c.drawString(xs["narr"], y, "Narration")
        c.drawString(xs["ref"], y, "Chq./Ref.No."); c.drawString(xs["vdt"], y, "Value Dt")
        c.drawRightString(xs["wd"], y, "Withdrawal Amt."); c.drawRightString(xs["dep"], y, "Deposit Amt.")
        c.drawRightString(xs["bal"], y, "Closing Balance")
    bal = 8420.00
    def draw(rows, y):
        nonlocal bal
        c.setFont("Helvetica", 8)
        for d,n,r,v,wd,dep in rows:
            amt = -float(wd.replace(",","")) if wd else float(dep.replace(",",""))
            bal = round(bal+amt,2)
            c.drawString(xs["date"], y, d)
            # wrap narration at ~38 chars
            parts=[n[i:i+36] for i in range(0,len(n),36)]
            c.drawString(xs["narr"], y, parts[0])
            c.drawString(xs["ref"], y, r); c.drawString(xs["vdt"], y, v)
            if wd: c.drawRightString(xs["wd"], y, wd)
            if dep: c.drawRightString(xs["dep"], y, dep)
            c.drawRightString(xs["bal"], y, f"{bal:,.2f}")
            for p in parts[1:]:
                y -= 10; c.drawString(xs["narr"], y, p)
            y -= 16
        return y
    c.setFont("Helvetica-Bold", 12); c.drawString(40, H-50, "HDFC BANK LTD - Statement of account")
    c.setFont("Helvetica", 9); c.drawString(40, H-66, "Account No : 50100XXXX1234   Period : 01/09/2026 To 30/09/2026")
    c.drawString(40, H-80, "Opening Balance :"); c.drawRightString(200, H-80, "8,420.00")
    header(H-110)
    draw(rows, H-126)
    c.setFont("Helvetica", 7); c.drawString(40, 30, "Page 1 of 2")
    c.showPage()
    header(H-60); draw(rows2, H-76)
    c.setFont("Helvetica-Bold", 8); c.drawString(40, H-200, "Closing Balance"); c.drawRightString(585, H-200, f"{bal:,.2f}")
    c.setFont("Helvetica", 7); c.drawString(40, 30, "Page 2 of 2   This is a computer generated statement")
    c.save()

def sbi(path):
    """SBI-style: Txn Date | Value Date | Description | Ref No./Cheque No. | Debit | Credit | Balance ; dates '1 Sep 2026'."""
    c = canvas.Canvas(path, pagesize=landscape(A4)); W2,H2 = landscape(A4)
    xs = [30,100,170,430,560,640,740]
    heads = ["Txn Date","Value Date","Description","Ref No./Cheque No.","Debit","Credit","Balance"]
    c.setFont("Helvetica-Bold",9)
    for i,h in enumerate(heads):
        (c.drawRightString if i>=4 else c.drawString)(xs[i] if i<4 else xs[i], H2-80, h)
    data=[("1 Sep 2026","1 Sep 2026","BY TRANSFER-NEFT*SALARY ACME","TRF123","", "30,000.00"),
          ("3 Sep 2026","3 Sep 2026","TO TRANSFER-UPI/DR/412/OLA CABS","UPI887","245.00",""),
          ("4 Sep 2026","4 Sep 2026","TO TRANSFER-UPI/DR/771/BESCOM","UPI889","1,320.00",""),
          ("9 Sep 2026","9 Sep 2026","BY TRANSFER-UPI/CR/ARJUN K","UPI990","", "500.00")]
    bal=1000.0; y=H2-100
    c.setFont("Helvetica",9)
    for r in data:
        amt = -float(r[4].replace(",","")) if r[4] else float(r[5].replace(",",""))
        bal+=amt
        for i,v in enumerate(r):
            if not v: continue
            (c.drawRightString if i>=4 else c.drawString)(xs[i], y, v)
        c.drawRightString(xs[6], y, f"{bal:,.2f}")
        y-=18
    c.save()

def marker(path):
    """No recognisable header: 'DD-MM-YYYY DESCRIPTION AMOUNT Dr/Cr BALANCE'."""
    c = canvas.Canvas(path, pagesize=A4)
    c.setFont("Helvetica",9)
    c.drawString(40,H-50,"Mini statement")
    lines=[("01-09-2026","UPI/ZOMATO/ORDER","250.00","Dr","9,750.00"),
           ("02-09-2026","NEFT/FREELANCE PROJECT","4,000.00","Cr","13,750.00"),
           ("04-09-2026","ACH/NETFLIX","649.00","Dr","13,101.00")]
    y=H-80
    for d,desc,a,m,b in lines:
        c.drawString(40,y,d); c.drawString(120,y,desc); c.drawRightString(400,y,a); c.drawString(410,y,m); c.drawRightString(520,y,b); y-=16
    c.save()

def balance_only(path):
    """Single 'Amount' column without markers; direction must come from the balance."""
    c = canvas.Canvas(path, pagesize=A4); c.setFont("Helvetica",9)
    c.drawString(40,H-50,"Opening Balance"); c.drawRightString(400,H-50,"5,000.00")
    c.setFont("Helvetica-Bold",9)
    c.drawString(40,H-80,"Date"); c.drawString(120,H-80,"Particulars"); c.drawRightString(320,H-80,"Amount"); c.drawRightString(420,H-80,"Balance")
    c.setFont("Helvetica",9)
    rows=[("05/09/2026","CARD PURCHASE DMART","1,200.00","3,800.00"),("06/09/2026","CASH DEPOSIT","2,000.00","5,800.00")]
    y=H-96
    for d,p,a,b in rows:
        c.drawString(40,y,d); c.drawString(120,y,p); c.drawRightString(320,y,a); c.drawRightString(420,y,b); y-=16
    c.save()

def hdfc_variants(path_int, path_bad):
    """Same layout; one statement with a whole-number amount (aligned), one with an unreadable amount."""
    for path, weird in [(path_int, "2000"), (path_bad, "2,O00.00")]:
        c = canvas.Canvas(path, pagesize=A4)
        xs = dict(date=40, narr=95, ref=300, wd=470, dep=530, bal=585)
        c.setFont("Helvetica", 9); c.drawString(40, H-50, "Opening Balance"); c.drawRightString(200, H-50, "5,000.00")
        c.setFont("Helvetica-Bold", 8)
        c.drawString(xs["date"], H-80, "Date"); c.drawString(xs["narr"], H-80, "Narration"); c.drawString(xs["ref"], H-80, "Ref No.")
        c.drawRightString(xs["wd"], H-80, "Withdrawal"); c.drawRightString(xs["dep"], H-80, "Deposit"); c.drawRightString(xs["bal"], H-80, "Balance")
        c.setFont("Helvetica", 8)
        rows = [("01/09/2026","CAFE COFFEE DAY","100045671234","250.00",None,"4,750.00"),
                ("02/09/2026","ATM WITHDRAWAL","100045671235",weird,None,"2,750.00"),
                ("03/09/2026","UPI FROM MEERA","100045671236",None,"500.00","3,250.00")]
        y = H-96
        for d,n,r,wd,dep,b in rows:
            c.drawString(xs["date"], y, d); c.drawString(xs["narr"], y, n); c.drawString(xs["ref"], y, r)
            if wd: c.drawRightString(xs["wd"], y, wd)
            if dep: c.drawRightString(xs["dep"], y, dep)
            c.drawRightString(xs["bal"], y, b); y -= 16
        c.setFont("Helvetica-Bold", 8); c.drawString(40, y-10, "Closing Balance"); c.drawRightString(585, y-10, "3,250.00")
        c.save()

def canara(path):
    """Canara Bank style: Date | Particulars | Deposits | Withdrawals | Balance.
    Bank masthead, opening/closing balance lines, repeated header across a page
    break, multi-line wrapped Particulars, blank deposit/withdrawal cells,
    same-day duplicate transactions, and one deliberately wrong balance cell
    (to exercise row-level reconciliation) that still nets out to the stated
    closing balance (to exercise whole-statement reconciliation separately)."""
    c = canvas.Canvas(path, pagesize=A4)
    xs = dict(date=40, part=95, dep=430, wd=500, bal=575)

    def header(y):
        c.setFont("Helvetica-Bold", 9)
        c.drawString(xs["date"], y, "Date")
        c.drawString(xs["part"], y, "Particulars")
        c.drawRightString(xs["dep"], y, "Deposits")
        c.drawRightString(xs["wd"], y, "Withdrawals")
        c.drawRightString(xs["bal"], y, "Balance")
        c.line(35, y - 4, 585, y - 4)

    def masthead():
        c.setFont("Helvetica-Bold", 13)
        c.drawString(40, H - 45, "CANARA BANK")
        c.setFont("Helvetica", 8)
        c.drawString(40, H - 60, "Account Statement   A/c No: 1234XXXXXX5678   Period: 01-09-2026 to 30-09-2026")

    def row(y, date, particulars_lines, dep, wd, bal):
        c.setFont("Helvetica", 8)
        c.drawString(xs["date"], y, date)
        c.drawString(xs["part"], y, particulars_lines[0])
        if dep:
            c.drawRightString(xs["dep"], y, dep)
        if wd:
            c.drawRightString(xs["wd"], y, wd)
        c.drawRightString(xs["bal"], y, bal)
        yy = y
        for extra in particulars_lines[1:]:
            yy -= 11
            c.drawString(xs["part"], yy, extra)
        return min(y, yy) - 15

    masthead()
    c.setFont("Helvetica", 9)
    c.drawString(40, H - 78, "Opening Balance")
    c.drawRightString(xs["bal"], H - 78, "52,000.00")
    header(H - 100)
    y = H - 116
    y = row(y, "01/09/2026", ["SALARY CREDIT SEPTEMBER 2026 ACME TECH PVT LTD"], "35,000.00", None, "87,000.00")
    y = row(y, "02/09/2026", ["UPI/DR/512345678901/SWIGGY BANGALORE", "ORDER 88213 FOOD DELIVERY PAYMENT"], None, "450.00", "86,550.00")
    y = row(y, "03/09/2026", ["UPI/CR/512345678999/RAHUL SHARMA/ICICI", "PAYMENT RECEIVED FROM FRIEND"], "2,000.00", None, "88,550.00")
    y = row(y, "03/09/2026", ["ATM WITHDRAWAL SELF SBIN0001234 BENGALURU"], None, "5,000.00", "83,550.00")
    y = row(y, "05/09/2026", ["UPI/DR/512345677777/ABC STORE", "BENGALURU", "REF 123456"], None, "850.00", "82,700.00")
    y = row(y, "06/09/2026", ["REFUND ORDER CANCELLED AMAZON", "ORDER 403-1123"], "899.00", None, "83,599.00")
    y = row(y, "06/09/2026", ["IMPS-RAHUL SHARMA-REIMBURSEMENT DINNER SPLIT"], "1,000.00", None, "84,599.00")
    y = row(y, "07/09/2026", ["UPI/DR/CAFE COFFEE DAY"], None, "150.00", "84,449.00")
    y = row(y, "07/09/2026", ["UPI/DR/CAFE COFFEE DAY"], None, "150.00", "84,299.00")
    c.setFont("Helvetica", 7)
    c.drawString(40, 30, "Page 1 of 2")
    c.showPage()

    masthead()
    header(H - 70)
    y = H - 86
    y = row(y, "10/09/2026", ["TRANSFER TO SAVINGS A/C XX4521 OWN ACCOUNT"], None, "10,000.00", "74,299.00")
    y = row(y, "15/09/2026", ["INTEREST CREDIT FOR SEP 2026"], "118.35", None, "74,417.35")
    y = row(y, "20/09/2026", ["NEFT CR-N998877-CONSULTING FEE CLIENT XYZ"], "1,25,000.00", None, "1,99,417.35")
    # Deliberately wrong printed balance on this row (true value is 1,96,966.60) —
    # exercises row-to-row balance validation without affecting the deposit/
    # withdrawal amount itself, so the whole-statement net still reconciles.
    y = row(y, "22/09/2026", ["UPI/DR/BESCOM ELECTRICITY BILL PAYMENT"], None, "2,450.75", "1,95,000.00")
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y - 4, "Closing Balance")
    c.drawRightString(xs["bal"], y - 4, "1,96,966.60")
    c.setFont("Helvetica", 7)
    c.drawString(40, 30, "Page 2 of 2   This is a computer generated statement and does not require a signature.")
    c.save()


def letter(path):
    c=canvas.Canvas(path,pagesize=A4); c.setFont("Helvetica",11)
    for i,l in enumerate(["Dear Customer,","Thank you for banking with us. Your card ending 1234 is now active.","Regards, Customer Care"]):
        c.drawString(50,H-80-18*i,l)
    c.save()

def scanned(path):
    c=canvas.Canvas(path,pagesize=A4); c.rect(50,50,300,300,fill=1); c.save()

import sys, os
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/pdfs"
os.makedirs(OUT, exist_ok=True)
P = lambda n: os.path.join(OUT, n)
hdfc(P("hdfc.pdf"))
hdfc(P("hdfc-locked.pdf"), StandardEncryption("DDMM1990", canPrint=1))
sbi(P("sbi.pdf")); marker(P("marker.pdf")); balance_only(P("balance.pdf"))
hdfc_variants(P("int-amount.pdf"), P("bad-row.pdf"))
canara(P("canara.pdf"))
letter(P("letter.pdf")); scanned(P("scanned.pdf"))
open(P("fake.pdf"),"w").write("not really a pdf")
print("ok")
