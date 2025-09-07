import csv
import xml.etree.ElementTree as ET
import time
import html
from urllib.request import urlopen
from urllib.parse import quote
from urllib.error import URLError, HTTPError

def call_kipris_api(application_number):
    """
    KIPRIS API를 호출하여 특허 정보를 가져오는 함수
    
    Args:
        application_number (str): 출원번호
    
    Returns:
        dict: 특허 정보 딕셔너리
    """
    # API 설정
    service_key = '3Mc0FYs/RDD7M4buAiSD8oaxme74hLKKGZ0T0jjvePY='
    base_url = 'http://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getBibliographyDetailInfoSearch'
    
    # API URL 구성
    url = f"{base_url}?applicationNumber={application_number}&ServiceKey={service_key}"
    
    try:
        print(f"  API 호출 중: 출원번호 {application_number}")
        
        # urllib를 사용한 API 호출
        with urlopen(url, timeout=10) as response:
            content = response.read()
        
        # UTF-8로 디코딩
        content_str = content.decode('utf-8')
        
        # HTML entities 디코딩 (&#44608; → 한글)
        content_str = html.unescape(content_str)
        
        # XML 파싱
        root = ET.fromstring(content_str)
        
        # 데이터 추출
        result = {
            '등록번호': '',
            '출원인': '',
            '발명자': '',
            '출원일': '',
            '등록일': '',
            '발명의명칭': '',
            '청구항수': ''
        }
        
        # 실제 KIPRIS API 구조에 맞게 파싱
        # 서지요약정보 추출
        biblio_info = root.find('.//biblioSummaryInfo')
        if biblio_info is not None:
            # 각 필드 직접 추출
            elem = biblio_info.find('registerNumber')
            if elem is not None and elem.text:
                result['등록번호'] = elem.text.strip()
            
            elem = biblio_info.find('applicationDate')
            if elem is not None and elem.text:
                result['출원일'] = elem.text.strip()
            
            elem = biblio_info.find('registerDate')
            if elem is not None and elem.text:
                result['등록일'] = elem.text.strip()
            
            elem = biblio_info.find('inventionTitle')
            if elem is not None and elem.text:
                result['발명의명칭'] = elem.text.strip()
            
            elem = biblio_info.find('claimCount')
            if elem is not None and elem.text:
                result['청구항수'] = elem.text.strip()
        
        # 출원인 정보 추출 (첫 번째 사람만)
        applicant_info = root.find('.//applicantInfoArray/applicantInfo')
        if applicant_info is not None:
            elem = applicant_info.find('name')
            if elem is not None and elem.text:
                result['출원인'] = elem.text.strip()
        
        # 발명자 정보 추출 (첫 번째 사람만)
        inventor_info = root.find('.//inventorInfoArray/inventorInfo')
        if inventor_info is not None:
            elem = inventor_info.find('name')
            if elem is not None and elem.text:
                result['발명자'] = elem.text.strip()
        
        # 성공 여부 확인 및 출력
        has_data = any([result['출원일'], result['발명의명칭'], result['출원인'], result['청구항수']])
        if has_data:
            print(f"    데이터 추출 성공")
            if result['등록번호']:
                print(f"      등록번호: {result['등록번호']}")
            if result['발명의명칭']:
                title = result['발명의명칭']
                print(f"      발명의명칭: {title[:30]}{'...' if len(title) > 30 else ''}")
            if result['출원인']:
                print(f"      출원인: {result['출원인']}")
        else:
            print(f"    데이터를 찾을 수 없음")
        
        return result
        
    except HTTPError as e:
        print(f"    HTTP 오류: {e.code} - {e.reason}")
        return None
    except URLError as e:
        print(f"    URL 오류: {e.reason}")
        return None
    except ET.ParseError as e:
        print(f"    XML 파싱 실패: {e}")
        return None
    except Exception as e:
        print(f"    예상치 못한 오류: {e}")
        import traceback
        traceback.print_exc()
        return None

def main():
    """메인 실행 함수"""
    try:
        # 1. result.csv 파일 읽기
        print("result.csv 파일 읽는 중...")
        input_data = []
        
        with open('result.csv', 'r', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                input_data.append({
                    '고객번호': row.get('고객번호', ''),
                    '출원번호': row.get('출원번호', '')
                })
        
        print(f"총 {len(input_data)}개의 데이터를 읽었습니다.")
        
        # 2. 각 출원번호에 대해 API 호출
        results = []
        for idx, data in enumerate(input_data, 1):
            customer_number = data['고객번호']
            application_number = data['출원번호']
            
            print(f"\n[{idx}/{len(input_data)}] 처리 중")
            print(f"  고객번호: {customer_number}")
            print(f"  출원번호: {application_number}")
            
            # 출원번호가 유효한 경우에만 API 호출
            if application_number and application_number != '검색결과없음':
                # API 호출
                api_result = call_kipris_api(application_number)
                
                if api_result:
                    # 결과 저장
                    result_row = {
                        '고객번호': customer_number,
                        '출원번호': application_number,
                        '등록번호': api_result['등록번호'],
                        '출원인': api_result['출원인'],
                        '발명자': api_result['발명자'],
                        '출원일': api_result['출원일'],
                        '등록일': api_result['등록일'],
                        '발명의명칭': api_result['발명의명칭'],
                        '청구항수': api_result['청구항수']
                    }
                    results.append(result_row)
                else:
                    # API 호출 실패 시 빈 값으로 저장
                    result_row = {
                        '고객번호': customer_number,
                        '출원번호': application_number,
                        '등록번호': '',
                        '출원인': '',
                        '발명자': '',
                        '출원일': '',
                        '등록일': '',
                        '발명의명칭': '',
                        '청구항수': ''
                    }
                    results.append(result_row)
            else:
                # 출원번호가 없는 경우
                result_row = {
                    '고객번호': customer_number,
                    '출원번호': application_number,
                    '등록번호': '',
                    '출원인': '',
                    '발명자': '',
                    '출원일': '',
                    '등록일': '',
                    '발명의명칭': '',
                    '청구항수': ''
                }
                results.append(result_row)
                print(f"    출원번호 없음 - 건너뜀")
            
            # API 호출 간격 조절 (과도한 요청 방지)
            if idx < len(input_data):
                time.sleep(0.5)  # 0.5초 대기
        
        # 3. 결과를 CSV 파일로 저장
        output_filename = 'result_api.csv'
        print(f"\n결과를 {output_filename} 파일에 저장 중...")
        
        with open(output_filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
            fieldnames = ['고객번호', '출원번호', '등록번호', '출원인', '발명자', 
                         '출원일', '등록일', '발명의명칭', '청구항수']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            # 헤더 쓰기
            writer.writeheader()
            
            # 데이터 쓰기
            writer.writerows(results)
        
        print(f"\n==============================")
        print(f"처리 완료!")
        print(f"총 {len(results)}개의 결과를 {output_filename} 파일에 저장했습니다.")
        
        # 간단한 통계 출력
        successful_count = sum(1 for r in results if any([r['등록번호'], r['출원인'], r['발명의명칭']]))
        print(f"데이터 조회 성공: {successful_count}개")
        print(f"데이터 조회 실패/출원번호 없음: {len(results) - successful_count}개")
        
    except FileNotFoundError:
        print("오류: result.csv 파일을 찾을 수 없습니다.")
        print("먼저 크롤링을 실행하여 result.csv 파일을 생성해주세요.")
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()