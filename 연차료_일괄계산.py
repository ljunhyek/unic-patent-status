import csv
import sys
from datetime import date, datetime
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

APP_TITLE = "연차료 계산기 (Desktop)"
DEFAULT_INPUT = "result_api.csv"
OUTPUT_FILE = "result_fee.csv"

# ====== 날짜 유틸 ======
def parse_date_yyyymmdd(s):
    # 허용: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # 숫자만 들어온 경우 (예: 20240315)
    if s.isdigit() and len(s) == 8:
        return date(int(s[0:4]), int(s[4:6]), int(s[6:8]))
    raise ValueError(f"지원하지 않는 날짜 형식: {s}")

def end_of_month(d):
    # 해당 월의 말일
    if d.month == 12:
        return d.replace(day=31)
    first_next = d.replace(day=28)
    while True:
        try:
            first_next = first_next.replace(day=first_next.day + 1)
        except ValueError:
            # 넘치면 이전 날짜가 말일
            return first_next
    # not reached

def add_months_keep_dom(d, months):
    # 월 더하기 + 가능한 경우 일 유지, 불가능하면 말일로 보정
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    day = d.day
    # 말일 보정
    while True:
        try:
            return date(y, m, day)
        except ValueError:
            day -= 1
            if day < 28:
                # 안전장치
                return end_of_month(date(y, m, 1))

def add_years_keep_dom(d, years):
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # 2/29 -> 2/28 같은 보정
        return d.replace(month=2, day=28, year=d.year + years)

# ====== 수수료 테이블 ======
def base_fee_for_year(n):
    # 1~3: 13,000 / 4~6: 36,000 / 7~9: 90,000 / 10~12: 216,000 / 13~25: 324,000
    if 1 <= n <= 3:
        return 13000
    if 4 <= n <= 6:
        return 36000
    if 7 <= n <= 9:
        return 90000
    if 10 <= n <= 12:
        return 216000
    if 13 <= n <= 25:
        return 324000
    # 그 외 범위는 상한(25년차)로 취급
    return 324000

def claim_fee_for_year(n):
    # 1~3: 12,000 / 4~6: 20,000 / 7~9: 34,000 / 10~25: 49,000 (청구항 1개당)
    if 1 <= n <= 3:
        return 12000
    if 4 <= n <= 6:
        return 20000
    if 7 <= n <= 9:
        return 34000
    if 10 <= n <= 25:
        return 49000
    return 49000

# ====== 상태 계산 ======
def compute_status_and_periods(due_date, today):
    # 추납: 납부마감일+6개월(말일 기준), 회복: 추납종료+3개월(말일 기준)
    grace_end = end_of_month(add_months_keep_dom(due_date, 6))
    recovery_end = end_of_month(add_months_keep_dom(grace_end, 3))

    if today <= due_date:
        status = "유효"
        late_period = f"{due_date.isoformat()} ~ {grace_end.isoformat()}"
        recovery_period = f"{grace_end.isoformat()} ~ {recovery_end.isoformat()}"
    elif due_date < today <= grace_end:
        status = "추납기간"
        late_period = f"진행중 ({grace_end.isoformat()} 마감)"
        recovery_period = f"{grace_end.isoformat()} ~ {recovery_end.isoformat()}"
    elif grace_end < today <= recovery_end:
        status = "회복기간"
        late_period = f"{due_date.isoformat()} ~ {grace_end.isoformat()}"
        recovery_period = f"진행중 ({recovery_end.isoformat()} 마감)"
    else:
        status = "불납"
        late_period = f"{due_date.isoformat()} ~ {grace_end.isoformat()}"
        recovery_period = f"{grace_end.isoformat()} ~ {recovery_end.isoformat()}"

    # 정상납부/미납
    if status == "불납":
        pay_status = "미납"
    elif status != "유효":
        pay_status = status
    else:
        pay_status = "정상납부"

    # 직전년도 납부연월(YYYY-MM)
    prev_year = add_years_keep_dom(due_date, -1)
    prev_ym = f"{prev_year.year:04d}-{prev_year.month:02d}"

    return status, pay_status, prev_ym, late_period, recovery_period

# ====== 연차수/납기일 계산 ======
def compute_annual_year_and_due(reg_date, today):
    """
    - 등록일부터 3년 업프론트 납부
    - 4년차의 납부마감일 = 등록일 + 3년
    - 매년 동일한 등록일 '기념일'에 다음 연차 납기
    - '해당연차수' = 오늘 기준 다음에 납부해야 할 연차(= nextYear)
    """
    three_year_mark = add_years_keep_dom(reg_date, 3)

    if today < three_year_mark:
        next_year = 4
        due = three_year_mark
    else:
        # 경과 연수(소수점 버림)
        delta_days = (today - three_year_mark).days
        elapsed_years = int(delta_days // 365.25)
        current_year = 4 + elapsed_years
        next_year = current_year + 1
        # 해당 연차(n)의 납부마감일 = 등록일 + (n-1)년
        due = add_years_keep_dom(reg_date, next_year - 1)

    if next_year < 4:
        next_year = 4
    if next_year > 25:
        next_year = 25  # 상한

    return next_year, due

# ====== 금액 계산 (감면 50%) ======
def compute_fee(year_n, claim_count, discount_rate=0.5):
    base = base_fee_for_year(year_n)
    claim_surcharge = claim_fee_for_year(year_n) * max(0, claim_count)
    normal = base + claim_surcharge
    discounted = round(normal * (1 - discount_rate))
    return normal, discounted

# ====== CSV 처리 ======
OUTPUT_HEADER = [
    "고객번호","출원번호","등록번호","출원인","발명자","출원일","등록일","발명의명칭","청구항수",
    "존속기간 만료일","직전년도 납부연월","해당 연차료 납부마감일","해당연차수",
    "해당연차료","유효/불납","정상납부/미납","추납기간","회복기간"
]

def read_csv_rows(path):
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        for r in reader:
            rows.append(r)
    return rows

def write_csv_rows(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        for r in rows:
            writer.writerow(r)

def process_file(input_path):
    today = date.today()
    raw = read_csv_rows(input_path)
    if not raw:
        raise RuntimeError("입력 파일이 비어 있습니다.")

    out_rows = [OUTPUT_HEADER]

    # 파일의 2행부터 데이터라고 명시하셨으므로, 0-based 인덱스 기준 1부터 처리
    start_idx = 1 if len(raw) >= 2 else 0

    for i in range(start_idx, len(raw)):
        row = raw[i]
        if len(row) < 9:
            # 최소 9열 필요
            continue

        # 원본 1~9열 (가능하면 그대로 출력)
        cust_no        = row[0].strip() if len(row) > 0 else ""
        app_no         = row[1].strip() if len(row) > 1 else ""
        reg_no         = row[2].strip() if len(row) > 2 else ""
        applicant      = row[3].strip() if len(row) > 3 else ""
        inventor       = row[4].strip() if len(row) > 4 else ""
        filing_date_s  = row[5].strip() if len(row) > 5 else ""
        reg_date_s     = row[6].strip() if len(row) > 6 else ""
        title          = row[7].strip() if len(row) > 7 else ""
        claims_s       = row[8].strip() if len(row) > 8 else ""

        # 날짜 파싱
        try:
            reg_date = parse_date_yyyymmdd(reg_date_s)
        except Exception:
            # 등록일 없으면 스킵
            continue

        # 청구항수
        try:
            claim_count = int(str(claims_s).split()[0].replace(",", ""))
        except Exception:
            claim_count = 0

        # 해당연차수 & 납부마감일
        annual_n, due_date = compute_annual_year_and_due(reg_date, today)

        # 금액(감면 50%)
        normal_fee, discount_fee = compute_fee(annual_n, claim_count, discount_rate=0.5)

        # 상태/기간/직전년도 납부연월
        status, pay_status, prev_ym, late_period, recovery_period = compute_status_and_periods(due_date, today)

        # 존속기간 만료일: 등록일 + 20년 (통상)
        expiry = add_years_keep_dom(reg_date, 20)

        out_rows.append([
            cust_no, app_no, reg_no, applicant, inventor, filing_date_s, reg_date_s, title, claims_s,
            expiry.isoformat(),                 # 존속기간 만료일
            prev_ym,                            # 직전년도 납부연월 (YYYY-MM)
            due_date.isoformat(),               # 해당 연차료 납부마감일
            f"{annual_n}년차",                  # 해당연차수
            f"{discount_fee:,}원",              # 해당연차료(감면적용)
            status,                             # 유효/불납
            pay_status,                         # 정상납부/미납
            late_period,                        # 추납기간
            recovery_period                     # 회복기간
        ])

    write_csv_rows(OUTPUT_FILE, out_rows)
    return len(out_rows) - 1  # 데이터 건수

# ====== UI ======
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("560x180")
        self.resizable(False, False)

        frm = ttk.Frame(self, padding=16)
        frm.pack(fill="both", expand=True)

        ttk.Label(frm, text="입력 CSV 파일명").grid(row=0, column=0, sticky="w")
        self.path_var = tk.StringVar(value=DEFAULT_INPUT)
        self.ent = ttk.Entry(frm, textvariable=self.path_var, width=48)
        self.ent.grid(row=0, column=1, padx=8, sticky="we")

        self.btn_browse = ttk.Button(frm, text="찾아보기", command=self.browse)
        self.btn_browse.grid(row=0, column=2)

        self.btn_run = ttk.Button(frm, text="연차료 계산", command=self.run_calc)
        self.btn_run.grid(row=1, column=1, pady=16)

        self.status_var = tk.StringVar(value="준비됨")
        ttk.Label(frm, textvariable=self.status_var).grid(row=2, column=0, columnspan=3, sticky="w")

        for i in range(3):
            frm.grid_columnconfigure(i, weight=(1 if i == 1 else 0))

    def browse(self):
        path = filedialog.askopenfilename(
            title="입력 CSV 선택",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")]
        )
        if path:
            self.path_var.set(path)

    def run_calc(self):
        path = self.path_var.get().strip() or DEFAULT_INPUT
        try:
            cnt = process_file(path)
            msg = f"완료: {OUTPUT_FILE} 생성 (총 {cnt}건)"
            self.status_var.set(msg)
            messagebox.showinfo("성공", msg)
        except FileNotFoundError:
            messagebox.showerror("오류", f"파일을 찾을 수 없습니다:\n{path}")
        except Exception as e:
            messagebox.showerror("오류", f"처리 중 오류가 발생했습니다:\n{e}")

if __name__ == "__main__":
    try:
        app = App()
        app.mainloop()
    except Exception as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)
