# -*- coding: utf-8 -*-
"""
KIPRIS ▸ [상세검색] ▸ 인명정보 ▸ 최종권리자(TRH)
고객번호로 검색 → 결과(searchResult.do)에서 '출원번호(일자)'만 정확히 수집 + CSV 저장

설치:
    pip install playwright
    playwright install

실행:
    python find_number2.py --customer 120230740981
    # 옵션 없이 실행하면 기본값 120230740981로 자동 실행됩니다.

옵션:
    --headful         : 브라우저 창 띄워서 실행(디버깅)
    --max-pages N     : 최대 페이지 수 (기본 100)
    --timeout MS      : 단계별 타임아웃(ms, 기본 20000)
    --csv PATH        : CSV 저장 경로(기본: 스크립트 폴더의 kipris_appnos.csv)
"""

import asyncio
import re
import sys
import csv
import argparse
from typing import List, Set
from pathlib import Path
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeoutError

KIPRIS_HOME = "https://www.kipris.or.kr/khome/main.do"
RESULT_URL_RE = re.compile(r"/khome/search/searchResult\.do", re.I)
APPNO_13 = re.compile(r"^(1|2)\d{12}$")  # 국내 출원번호(13자리, 10/20 시작)
DEFAULT_CSV = (Path(__file__).parent / "kipris_appnos.csv").resolve()

# ---------------- 유틸 ----------------
async def try_click_many(page: Page, selectors: List[str], timeout: int = 2000) -> bool:
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if await loc.count():
                try:
                    await loc.scroll_into_view_if_needed()
                except:
                    pass
                try:
                    await loc.click(timeout=timeout)
                    return True
                except:
                    # JS 클릭 폴백
                    try:
                        ok = await page.evaluate(
                            """(selector) => {
                                const el = document.querySelector(selector);
                                if (!el) return false;
                                el.scrollIntoView({block:'center', inline:'center'});
                                el.click();
                                return true;
                            }""",
                            sel,
                        )
                        if ok:
                            return True
                    except:
                        pass
        except:
            pass
    return False


def prompt_customer() -> str:
    print("\n권리자 고객번호를 입력하세요 (예: 120230740981): ", end="", flush=True)
    try:
        return input().strip()
    except EOFError:
        return ""


# ---------------- 단계 ----------------
async def open_detail_search(page: Page, timeout: int):
    print("[1/6] 메인 접속…", flush=True)
    await page.goto(KIPRIS_HOME, wait_until="domcontentloaded", timeout=timeout)

    # 팝업/배너 닫기(있으면)
    for sel in ['button:has-text("닫기")', 'button.close', '[aria-label="Close"]']:
        try:
            if await page.locator(sel).count():
                await page.locator(sel).first.click(timeout=800)
        except:
            pass

    print("[2/6] [상세검색] 진입 시도…", flush=True)
    clicked = await try_click_many(
        page,
        [
            "a:has-text('상세검색')",
            "button:has-text('상세검색')",
            "//a[contains(text(),'상세검색')]",
            "//button[contains(text(),'상세검색')]",
            "text=상세검색",
        ],
        timeout=timeout,
    )
    if not clicked:
        print("  - 상세검색 버튼 탐색 실패(상세영역이 기본 노출 레이아웃일 수 있음).", flush=True)

    try:
        await page.wait_for_load_state("networkidle", timeout=timeout)
    except PWTimeoutError:
        pass


async def prepare_TRH_and_input(page: Page, timeout: int):
    """
    인명정보 탭 활성화 → select#sd01_g04_category_07 = 'TRH'로 설정(+ change 이벤트) →
    TRH 입력칸(#sd01_g04_text_07 또는 input[data-field='TRH']) 로케이터 반환
    """
    print("[3/6] 인명정보 ▸ 최종권리자(TRH) 설정…", flush=True)

    # 인명정보 탭/버튼 클릭(있으면)
    await try_click_many(
        page,
        [
            "button:has-text('인명정보')",
            "a:has-text('인명정보')",
            "//button[contains(text(),'인명정보')]",
            "//a[contains(text(),'인명정보')]",
        ],
        timeout=timeout,
    )
    try:
        await page.wait_for_timeout(300)
    except:
        pass

    info = await page.evaluate(
        """
    () => {
      // 1) TRH 셀렉트 설정
      let sel = document.querySelector('#sd01_g04_category_07');
      if (sel) {
        const prefer = Array.from(sel.options||[]).find(o => (o.value||'')==='TRH');
        if (prefer) sel.value = 'TRH';
        else {
          const byText = Array.from(sel.options||[]).find(o => /최종권리자/.test(o.textContent||''));
          if (byText) sel.value = byText.value;
        }
        sel.dispatchEvent(new Event('input', {bubbles:true}));
        sel.dispatchEvent(new Event('change', {bubbles:true}));
      }

      // 2) TRH 입력칸 찾기
      let inp = document.querySelector('input[data-field="TRH"]') || document.querySelector('#sd01_g04_text_07');
      if (!inp && sel) {
        const row = sel.closest('.row, tr, .search-row, .cell, .grid, .columns, .f-group') || sel.parentElement;
        if (row) inp = row.querySelector('input[type="text"]');
      }
      if (!inp) {
        inp = Array.from(document.querySelectorAll('input[type="text"]')).find(el => {
          const ph = (el.getAttribute('placeholder')||'') + ' ' + (el.getAttribute('aria-label')||'');
          return /고객번호|특허고객번호|TRH|최종권리자/.test(ph);
        }) || null;
      }
      if (!inp) return { ok:false };

      const inpSel = inp.id ? ('#'+inp.id) : (inp.getAttribute('data-field') ? `input[data-field="${inp.getAttribute('data-field')}"]` : null);
      return { ok:true, inputSelector: inpSel || 'input[type="text"]' };
    }
    """
    )
    if not info or not info.get("ok"):
        raise RuntimeError("TRH 입력칸 탐색 실패")
    return page.locator(info["inputSelector"])


async def submit_search(page: Page, trh_input, customer: str, timeout: int):
    print(f"[4/6] 고객번호 입력: {customer}", flush=True)
    await trh_input.fill(customer, timeout=timeout)

    # 바인딩된 프론트 이벤트 보장(입력값 설정 후 input/change/blur 발행)
    sel = await trh_input.evaluate(
        "el => el.id ? '#' + el.id : (el.getAttribute('data-field') ? 'input[data-field=\"' + el.getAttribute('data-field') + '\"]' : null)"
    )
    if sel:
        await page.evaluate(
            """([selector, val]) => {
                const el = document.querySelector(selector);
                if (!el) return;
                el.value = val;
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
                el.dispatchEvent(new Event('blur', {bubbles:true}));
            }""",
            [sel, customer],
        )

    print("[5/6] 검색 실행…", flush=True)
    # 1) 버튼 클릭
    clicked = await try_click_many(
        page,
        [
            "button:has-text('검색'):not(:has-text('상세'))",
            "button.btn-search",
            "input[type='submit'][value*='검색']",
            "a:has-text('검색'):not(:has-text('상세'))",
            "#searchBtn",
            ".search-btn",
        ],
        timeout=timeout,
    )
    # 2) 상세검색 함수 직접 호출
    if not clicked:
        try:
            await page.evaluate(
                """() => {
                    if (window.fnSearchDetail && typeof fnSearchDetail.search === 'function') {
                        fnSearchDetail.search();
                    }
                }"""
            )
        except:
            pass
    # 3) Enter 폴백
    try:
        await trh_input.press("Enter")
    except:
        pass

    # 결과 대기(주소 이동 또는 내용 로딩)
    try:
        await page.wait_for_url(RESULT_URL_RE, timeout=timeout)
    except PWTimeoutError:
        try:
            await page.wait_for_load_state("networkidle", timeout=timeout)
        except PWTimeoutError:
            pass


# --- 출원번호 정밀 추출 (DOM 기반) ---
async def extract_appnos_on_page(page: Page) -> List[str]:
    # 1) '출원번호(일자)' 라벨이 있는 li 안에서 div.link-wrap > p.txt 텍스트의 괄호 앞 13자리 추출
    appnos = await page.evaluate(
        """
    () => {
      const out = [];
      const labels = document.querySelectorAll('em.tit[data-lang-id="srlt.patent.an"]');
      labels.forEach(em => {
        const li = em.closest('li');
        if (!li) return;
        const p = li.querySelector('div.link-wrap > p.txt');
        if (!p) return;
        const txt = (p.textContent || '').replace(/\\s+/g, '');
        const m = txt.match(/(\\d{13})\\(/);
        if (m) out.push(m[1]);
      });
      return out;
    }
    """
    )

    # 2) 보조: 제목 버튼의 openDetail('kpat','<13자리>')에서 추출
    if not appnos or len(appnos) == 0:
        fallback = await page.evaluate(
            """
        () => {
          return Array.from(document.querySelectorAll('h1.title button[onclick^="openDetail"]'))
            .map(b => (b.getAttribute('onclick')||'').match(/'kpat'\\s*,\\s*'(\\d{13})'/))
            .filter(Boolean).map(m => m[1]);
        }
        """
        )
        appnos = fallback

    uniq = sorted(set([a for a in appnos if a and APPNO_13.match(a)]))
    return uniq


async def paginate(page: Page, timeout: int) -> bool:
    # '다음/Next/＞' 등
    if await try_click_many(
        page,
        [
            "a:has-text('다음')",
            "button:has-text('다음')",
            "a:has-text('Next')",
            "button:has-text('Next')",
            "a:has-text('＞')",
            "a:has-text('>')",
        ],
        timeout=timeout,
    ):
        try:
            await page.wait_for_load_state("networkidle", timeout=timeout)
        except PWTimeoutError:
            pass
        return True
    return False


# ---------------- 메인 ----------------
async def _main():
    parser = argparse.ArgumentParser(description="KIPRIS ▸ 최종권리자(TRH) ▸ 출원번호(일자) 수집 + CSV 저장")
    parser.add_argument("--customer", "-c", type=str, default="", help="권리자 고객번호")
    parser.add_argument("--headful", action="store_true", help="브라우저 창 표시(디버깅)")
    parser.add_argument("--max-pages", type=int, default=100)
    parser.add_argument("--timeout", type=int, default=20000)
    parser.add_argument("--csv", type=str, default=str(DEFAULT_CSV), help="CSV 저장 경로")
    args = parser.parse_args()

    customer = (args.customer or "").strip() or prompt_customer()
    if not customer:
        customer = "120230740981"  # 기본값
        print(f"[기본 고객번호 사용] {customer}", flush=True)

    if customer.isdigit() and len(customer) < 12:
        customer = customer.zfill(12)
    print(f"[고객번호 확인] {customer}", flush=True)

    csv_path = Path(args.csv).expanduser().resolve()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not args.headful)
        page = await browser.new_page()
        try:
            await open_detail_search(page, timeout=args.timeout)
            trh_input = await prepare_TRH_and_input(page, timeout=args.timeout)
            await submit_search(page, trh_input, customer, timeout=args.timeout)

            print("[6/6] 결과 수집…", flush=True)
            all_appnos: Set[str] = set()
            for _ in range(max(1, args.max_pages)):
                for a in await extract_appnos_on_page(page):
                    all_appnos.add(a)
                if not await paginate(page, timeout=args.timeout):
                    break
        finally:
            await browser.close()

    lst = sorted(all_appnos)
    print("\n=== 출원번호(일자) — Application Numbers ===", flush=True)
    print(f"총 {len(lst)}건", flush=True)
    for a in lst:
        print(a, flush=True)

    # CSV 저장
    try:
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["applicationNumber"])
            for a in lst:
                w.writerow([a])
        print(f"\n[저장 완료] {csv_path}", flush=True)
    except Exception as e:
        print(f"\n[CSV 저장 실패] {e!r}", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        print("중단됨", flush=True)
