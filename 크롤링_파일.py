import csv
import re
from playwright.sync_api import sync_playwright

def get_application_numbers(customer_number):
    """
    KIPRIS에서 고객번호로 검색하여 출원번호를 추출하는 함수
    
    Args:
        customer_number (str): 12자리 고객번호
    
    Returns:
        list: 출원번호 리스트
    """
    with sync_playwright() as p:
        # 브라우저 실행 (headless=False로 설정하면 브라우저 창이 보임)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        try:
            # 1. KIPRIS 홈페이지 접속
            print(f"  KIPRIS 홈페이지 접속 중...")
            page.goto("https://www.kipris.or.kr/khome/main.do", wait_until="networkidle")
            
            # 2. 검색어 입력
            search_query = f"TRH=[{customer_number}]"
            print(f"  검색어 입력: {search_query}")
            
            # 검색어 입력란 찾기
            search_input = page.wait_for_selector("#inputQuery", timeout=10000)
            search_input.fill(search_query)
            
            # 3. 검색 버튼 클릭
            print("  검색 실행 중...")
            # Enter 키를 눌러서 검색 실행
            search_input.press("Enter")
            
            # 검색 결과 페이지 로딩 대기
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)  # 추가 대기 시간
            
            # 4. 출원번호 추출
            print("  출원번호 추출 중...")
            application_numbers = []
            
            # 출원번호가 포함된 요소들 찾기
            # 여러 가능한 셀렉터 시도
            selectors = [
                "p.txt",  # 제공된 셀렉터
                "td:has-text('20')",  # 출원번호가 20으로 시작하는 경우가 많음
                "[class*='application']",  # application이 포함된 클래스
                "span:has-text('20')"  # span 태그 내 출원번호
            ]
            
            for selector in selectors:
                try:
                    elements = page.query_selector_all(selector)
                    for element in elements:
                        text = element.inner_text()
                        # 12자리 숫자 패턴 찾기 (출원번호)
                        matches = re.findall(r'\b(\d{12,13})\b', text)
                        for match in matches:
                            if match not in application_numbers:
                                application_numbers.append(match)
                                print(f"    찾은 출원번호: {match}")
                except:
                    continue
            
            # 결과가 없는 경우 페이지 내용 확인
            if not application_numbers:
                print("  출원번호를 찾을 수 없습니다.")
                # 디버깅을 위해 페이지 내용 일부 출력
                content = page.content()
                if "검색결과가 없습니다" in content:
                    print("  검색 결과가 없습니다.")
                
            return application_numbers
            
        except Exception as e:
            print(f"  오류 발생: {e}")
            return []
        
        finally:
            browser.close()

def process_customer_number(raw_number):
    """
    고객번호에서 하이픈을 제거하고 12자리 숫자로 변환
    
    Args:
        raw_number (str): 원본 고객번호 (하이픈 포함 가능)
    
    Returns:
        str: 12자리 숫자 고객번호 또는 None
    """
    # 숫자만 추출
    numbers_only = re.sub(r'[^0-9]', '', str(raw_number))
    
    # 12자리 확인
    if len(numbers_only) == 12:
        return numbers_only
    else:
        print(f"  경고: '{raw_number}'는 12자리 숫자가 아닙니다. (변환 후: {numbers_only}, {len(numbers_only)}자리)")
        return None

def parse_range(range_str):
    """
    행 범위 문자열을 파싱하여 시작과 끝 인덱스 반환
    
    Args:
        range_str (str): "1~5" 형식의 범위 문자열
    
    Returns:
        tuple: (시작 인덱스, 끝 인덱스)
    """
    try:
        if '~' in range_str:
            start, end = range_str.split('~')
            return int(start.strip()), int(end.strip())
        else:
            # 단일 행 지정
            row_num = int(range_str.strip())
            return row_num, row_num
    except:
        print("잘못된 범위 형식입니다. '1~5' 형식으로 입력해주세요.")
        return None, None

def main():
    """메인 실행 함수"""
    # 1. CSV 파일명 입력받기
    csv_filename = input("CSV 파일명을 입력하세요 (엔터 시 기본값: input_data.csv): ").strip()
    if not csv_filename:
        csv_filename = "input_data.csv"
        print(f"기본값 사용: {csv_filename}")
    
    # 2. 행 범위 입력받기
    range_str = input("처리할 행 범위를 입력하세요 (예: 1~5, 엔터 시 전체): ").strip()
    
    try:
        # CSV 파일 읽기
        with open(csv_filename, 'r', encoding='utf-8-sig') as csvfile:
            reader = csv.reader(csvfile)
            rows = list(reader)
            
            # 헤더가 있는 경우 첫 번째 행 건너뛰기
            if rows and not rows[0][0].replace('-', '').isdigit():
                header = rows[0]
                data_rows = rows[1:]
                print(f"헤더 감지: {header}")
            else:
                data_rows = rows
            
            # 행 범위 결정
            if range_str:
                start_idx, end_idx = parse_range(range_str)
                if start_idx is None:
                    return
                # 1-based 인덱스를 0-based로 변환
                start_idx = max(0, start_idx - 1)
                end_idx = min(len(data_rows), end_idx)
                selected_rows = data_rows[start_idx:end_idx]
                print(f"처리할 행: {start_idx + 1}행부터 {end_idx}행까지")
            else:
                selected_rows = data_rows
                print(f"전체 {len(selected_rows)}행 처리")
            
            # 결과 저장용 리스트
            results = []
            
            # 3. 각 행에 대해 크롤링 수행
            for idx, row in enumerate(selected_rows, 1):
                if not row:  # 빈 행 건너뛰기
                    continue
                
                # 첫 번째 열을 고객번호로 가정
                raw_customer_number = row[0]
                print(f"\n[{idx}/{len(selected_rows)}] 처리 중: {raw_customer_number}")
                
                # 고객번호 처리 (하이픈 제거)
                customer_number = process_customer_number(raw_customer_number)
                
                if customer_number:
                    # 출원번호 크롤링
                    application_numbers = get_application_numbers(customer_number)
                    
                    if application_numbers:
                        # 각 출원번호에 대해 결과 저장
                        for app_number in application_numbers:
                            results.append([customer_number, app_number])
                            print(f"  저장: 고객번호={customer_number}, 출원번호={app_number}")
                    else:
                        # 출원번호가 없는 경우에도 고객번호만 저장
                        results.append([customer_number, "검색결과없음"])
                        print(f"  저장: 고객번호={customer_number}, 출원번호=검색결과없음")
                else:
                    print(f"  건너뜀: 유효하지 않은 고객번호")
            
            # 4. 결과를 CSV 파일로 저장
            if results:
                with open('result.csv', 'w', newline='', encoding='utf-8-sig') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(['고객번호', '출원번호'])  # 헤더
                    writer.writerows(results)
                
                print(f"\n==============================")
                print(f"총 {len(results)}개의 결과를 result.csv 파일에 저장했습니다.")
                print(f"처리한 고객번호 수: {len(selected_rows)}개")
            else:
                print("\n결과가 없어 CSV 파일을 생성하지 않았습니다.")
                
    except FileNotFoundError:
        print(f"오류: '{csv_filename}' 파일을 찾을 수 없습니다.")
        print("파일명과 경로를 확인해주세요.")
    except Exception as e:
        print(f"오류 발생: {e}")

if __name__ == "__main__":
    main()