# -*- coding: utf-8 -*-
"""
KIPRIS ▸ [상세검색] ▸ 인명정보 ▸ 최종권리자(TRH)
input_data.csv의 '특허고객번호'에서 범위를 읽어(하이픈 제거) → 고객별 출원번호 크롤링
→ result_data.csv에 고객번호 1줄, 출원번호는 ,로 나열하여 저장
"""

import asyncio
import re
import csv
import pandas as pd
from pathlib import Path
from collections import defaultdict
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeoutError

# 파일 경로
INPUT_CSV = Path("input_data.csv")
OUTPUT_CSV = Path("result_data.csv")

# KIPRIS 기본 상수
KIPRIS_HOME = "https://www.kipris.or.kr/khome/main.do"
RESULT_URL_RE = re.compile(r"/khome/search/searchResult\.do", re.I)
APPNO_13 = re.compile(r"^(1|2)\d{12}$")  # 13자리 출원번호


# ----------- 유틸 함수 -----------
async def try_click_many(page: Page, selectors, timeout: int = 2000) -> bool:
    """여러 셀렉터 후보 중 클릭 가능한 첫 요소 클릭"""
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if await loc.count():
                await loc.scroll_into_view_if_needed()
                await loc.click(timeout=timeout)
                return True
        except:
            pass
    return False


async def wait_for_results(page: Page, timeout: int = 15000):
    """검색 결과가 보일 때까지 대기"""
    try:
        await page.wait_for_selector("ul.result-list li", timeout=timeout)
    except PWTimeoutError:
        pass


# ----------- KIPRIS 단계 -----------
async def open_detail_search(page: Page, timeout: int = 20000):
    await page.goto(KIPRIS_HOME, wait_until="domcontentloaded", timeout=timeout)
    await try_click_many(page, ["a:has-text('상세검색')", "button:has-text('상세검색')"], timeout=timeout)
    try:
        await page.wait_for_load_state("networkidle", timeout=timeout)
    except:
        pass


async def prepare_TRH_and_input(page: Page, timeout: int):
    """최종권리자(TRH) 입력칸 반환"""
    info = await page.evaluate(
        """
    () => {
      let sel = document.querySelector('#sd01_g04_category_07');
      if (sel) {
        const opt = Array.from(sel.options||[]).find(o => (o.value||'')==='TRH');
        if (opt) sel.value = 'TRH';
        sel.dispatchEvent(new Event('change', {bubbles:true}));
      }
      let inp = document.querySelector('input[data-field="TRH"]') || document.querySelector('#sd01_g04_text_07');
      if (!inp) return { ok:false };
      return { ok:true, inputSelector: inp.id ? '#'+inp.id : 'input[data-field="TRH"]' };
    }
    """
    )
    if not info or not info.get("ok"):
        raise RuntimeError("TRH 입력칸을 찾을 수 없습니다.")
    return page.locator(info["inputSelector"])


async def submit_search(page: Page, trh_input, customer: str, timeout: int):
    """고객번호 입력 후 검색 실행"""
    await trh_input.fill(customer, timeout=timeout)
    await try_click_many(page, ["button:has-text('검색')"], timeout=timeout)
    try:
        await page.wait_for_url(RESULT_URL_RE, timeout=timeout)
    except:
        pass
    await wait_for_results(page, timeout=timeout)


async def extract_appnos_on_page(page: Page):
    """현재 페이지의 출원번호 추출"""
    appnos = await page.evaluate(
        """
    () => {
      const out = [];
      document.querySelectorAll('em.tit[data-lang-id="srlt.patent.an"]').forEach(em => {
        const li = em.closest('li');
        if (!li) return;
        const p = li.querySelector('div.link-wrap > p.txt');
        if (!p) return;
        const txt = (p.textContent||'').replace(/\\s+/g, '');
        const m = txt.match(/(\\d{13})\\(/);
        if (m) out.push(m[1]);
      });
      return out;
    }
    """
    )
    return sorted(set([a for a in appnos if a and APPNO_13.match(a)]))


async def crawl_for_customer(page: Page, customer: str, timeout: int = 20000):
    """단일 고객번호 크롤링"""
    trh_input = await prepare_TRH_and_input(page, timeout=timeout)
    await submit_search(page, trh_input, customer, timeout=timeout)
    return await extract_appnos_on_page(page)


# ----------- 메인 루프 -----------
async def crawl_batch(customers, timeout: int = 20000, headless: bool = True):
    results = defaultdict(list)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        page = await browser.new_page()
        await open_detail_search(page, timeout=timeout)
        for cust in customers:
            print(f"\n=== 고객번호 {cust} 크롤링 시작 ===")
            try:
                appnos = await crawl_for_customer(page, cust, timeout=timeout)
                results[cust].extend(appnos)
                print(f"  → {len(appnos)}건 수집")
            except Exception as e:
                print(f"  [오류] {cust}: {e}")
        await browser.close()
    return results


def main():
    # 행 범위 입력
    rng = input("크롤링할 행 범위를 입력하세요 (예: 2~10): ").strip()
    start, end = map(int, rng.split("~"))

    # CSV 읽기
    df = pd.read_csv(INPUT_CSV, dtype=str)
    if "특허고객번호" not in df.columns:
        print("CSV에 '특허고객번호' 열이 없습니다.")
        return

    df_range = df.iloc[start - 1 : end]  # 2행부터 데이터
    customers = [str(x).replace("-", "").strip() for x in df_range["특허고객번호"].dropna()]

    # 크롤링 실행
    results = asyncio.run(crawl_batch(customers, timeout=20000, headless=True))

    # CSV 저장 (한 줄 = 고객번호, 출원번호1, 출원번호2, ...)
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["고객번호", "출원번호"])
        for cust, appnos in results.items():
            row = [cust] + appnos
            writer.writerow(row)

    total = sum(len(v) for v in results.values())
    print(f"\n[완료] {OUTPUT_CSV.resolve()} 저장됨, 총 {total}건")


if __name__ == "__main__":
    main()
