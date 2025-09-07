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
            print(f"KIPRIS 홈페이지 접속 중...")
            page.goto("https://www.kipris.or.kr/khome/main.do", wait_until="networkidle")
            
            # 2. 검색어 입력
            search_query = f"TRH=[{customer_number}]"
            print(f"검색어 입력: {search_query}")
            
            # 검색어 입력란 찾기
            search_input = page.wait_for_selector("#inputQuery", timeout=10000)
            search_input.fill(search_query)
            
            # 3. 검색 버튼 클릭
            print("검색 실행 중...")
            # Enter 키를 눌러서 검색 실행
            search_input.press("Enter")
            
            # 검색 결과 페이지 로딩 대기
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)  # 추가 대기 시간
            
            # 4. 출원번호 추출
            print("출원번호 추출 중...")
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
                                print(f"  찾은 출원번호: {match}")
                except:
                    continue
            
            # 결과가 없는 경우 페이지 내용 확인
            if not application_numbers:
                print("출원번호를 찾을 수 없습니다. 페이지 구조를 확인해주세요.")
                # 디버깅을 위해 페이지 내용 일부 출력
                content = page.content()
                if "검색결과가 없습니다" in content:
                    print("검색 결과가 없습니다.")
                
            return application_numbers
            
        except Exception as e:
            print(f"오류 발생: {e}")
            return []
        
        finally:
            browser.close()

def main():
    """메인 실행 함수"""
    # 사용자로부터 고객번호 입력받기
    customer_number = input("고객번호를 입력하세요 (12자리, 엔터 시 기본값: 120190612244): ").strip()
    
    # 입력값 검증
    if not customer_number:
        customer_number = "120190612244"
        print(f"기본값 사용: {customer_number}")
    elif len(customer_number) != 12 or not customer_number.isdigit():
        print("경고: 고객번호는 12자리 숫자여야 합니다.")
        if input("계속하시겠습니까? (y/n): ").lower() != 'y':
            return
    
    # 출원번호 가져오기
    application_numbers = get_application_numbers(customer_number)
    
    # CSV 파일로 저장
    if application_numbers:
        with open('number.csv', 'w', newline='', encoding='utf-8-sig') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['고객번호', '출원번호'])  # 헤더
            
            for app_number in application_numbers:
                writer.writerow([customer_number, app_number])
                print(f"저장: 고객번호={customer_number}, 출원번호={app_number}")
        
        print(f"\n총 {len(application_numbers)}개의 출원번호를 number.csv 파일에 저장했습니다.")
    else:
        print("출원번호를 찾을 수 없어 CSV 파일을 생성하지 않았습니다.")
        print("\n다음 사항을 확인해주세요:")
        print("1. 고객번호가 올바른지 확인")
        print("2. KIPRIS 웹사이트 구조가 변경되었는지 확인")
        print("3. 네트워크 연결 상태 확인")

if __name__ == "__main__":
    main()