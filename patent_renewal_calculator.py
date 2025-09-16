#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
파이썬 특허 연차료 계산 시스템
⚠️ 더 이상 사용되지 않음: 크롤링 기반 Node.js 시스템으로 전환됨
이 파일은 참고용으로만 보관됨

사용법:
Node.js 기반 웹 시스템을 사용하세요 (npm start)
"""

import os
import sys
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
import json
import csv
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

@dataclass
class PatentInfo:
    """특허 정보 데이터 클래스"""
    application_number: str
    registration_number: str
    applicant_name: str
    registration_date: str
    invention_title: str
    claim_count: str
    expiration_date: str

@dataclass
class RenewalFeeInfo:
    """연차료 정보 데이터 클래스"""
    due_date: str
    year_number: str
    fee_amount: str
    status: str
    next_year_request: str
    late_payment_period: str
    recovery_period: str

class RenewalFeeCalculator:
    """연차료 계산기"""

    # 2024년 기준 연차료 (원)
    RENEWAL_FEES = {
        1: 42000, 2: 42000, 3: 42000,
        4: 95000, 5: 95000, 6: 95000,
        7: 250000, 8: 250000, 9: 250000,
        10: 500000, 11: 500000, 12: 500000,
        13: 660000, 14: 660000, 15: 660000,
        16: 850000, 17: 850000, 18: 850000,
        19: 1100000, 20: 1100000
    }

    def __init__(self):
        self.today = datetime.now().date()

    def calculate_renewal_info(self, patent: PatentInfo) -> RenewalFeeInfo:
        """연차료 정보 계산"""
        if patent.registration_date == '-':
            return self._create_empty_renewal_info()

        try:
            reg_date = datetime.strptime(patent.registration_date, '%Y-%m-%d').date()
            current_year = self._calculate_current_renewal_year(reg_date)

            if current_year > 20:
                return self._create_expired_renewal_info()

            due_date = self._calculate_due_date(reg_date, current_year)
            fee_amount = self.RENEWAL_FEES.get(current_year, 0)
            status = self._determine_status(due_date)

            return RenewalFeeInfo(
                due_date=due_date.strftime('%Y-%m-%d'),
                year_number=f"{current_year}년차",
                fee_amount=f"{fee_amount:,}원",
                status=status,
                next_year_request=self._calculate_next_year_request(current_year, due_date),
                late_payment_period=self._calculate_late_payment_period(due_date, status),
                recovery_period=self._calculate_recovery_period(due_date, status)
            )

        except ValueError as e:
            print(f"❌ 날짜 처리 오류: {e}")
            return self._create_empty_renewal_info()

    def _calculate_current_renewal_year(self, registration_date) -> int:
        """현재 연차수 계산"""
        years_passed = (self.today - registration_date).days // 365
        return min(years_passed + 1, 20)

    def _calculate_due_date(self, registration_date, year_number: int):
        """납부 마감일 계산 (등록일 + (연차수-1)년)"""
        return registration_date.replace(year=registration_date.year + (year_number - 1))

    def _determine_status(self, due_date) -> str:
        """유효/불납 상태 판정"""
        days_diff = (due_date - self.today).days

        if days_diff > 0:
            return "유효"
        elif days_diff >= -180:  # 추납기간 (6개월)
            return "추납기간"
        elif days_diff >= -540:  # 회복기간 (추가 12개월)
            return "회복기간"
        else:
            return "만료"

    def _calculate_next_year_request(self, current_year: int, due_date) -> str:
        """차기년도 납부의뢰 정보"""
        if current_year >= 20:
            return "만료"

        next_year = current_year + 1
        next_fee = self.RENEWAL_FEES.get(next_year, 0)
        next_due_date = due_date.replace(year=due_date.year + 1)

        return f"{next_year}년차 {next_fee:,}원 ({next_due_date.strftime('%Y-%m-%d')} 마감)"

    def _calculate_late_payment_period(self, due_date, status: str) -> str:
        """추납기간 계산"""
        if status != "추납기간":
            return "-"

        start_date = due_date + timedelta(days=1)
        end_date = due_date + timedelta(days=180)

        if self.today <= end_date:
            return f"진행중 ({end_date.strftime('%Y-%m-%d')} 마감)"
        else:
            return f"{start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}"

    def _calculate_recovery_period(self, due_date, status: str) -> str:
        """회복기간 계산"""
        if status != "회복기간":
            return "-"

        start_date = due_date + timedelta(days=181)
        end_date = due_date + timedelta(days=540)

        if self.today <= end_date:
            return f"진행중 ({end_date.strftime('%Y-%m-%d')} 마감)"
        else:
            return f"{start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}"

    def _create_empty_renewal_info(self) -> RenewalFeeInfo:
        """빈 연차료 정보 생성"""
        return RenewalFeeInfo("-", "-", "-", "-", "-", "-", "-")

    def _create_expired_renewal_info(self) -> RenewalFeeInfo:
        """만료된 특허 연차료 정보"""
        return RenewalFeeInfo("-", "만료", "-", "만료", "만료", "-", "-")

class CSVGenerator:
    """CSV 파일 생성기"""

    def __init__(self):
        pass

    def create_renewal_report(self, customer_number: str, patents_data: List[tuple], applicant_name: str = "") -> str:
        """연차료 보고서 CSV 파일 생성"""
        try:
            # 파일명 생성
            current_time = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"특허연차료현황_{customer_number}_{current_time}.csv"

            # CSV 파일 생성
            with open(filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
                writer = csv.writer(csvfile)

                # 제목 및 고객 정보
                writer.writerow(['특허 연차료 현황 보고서'])
                writer.writerow([])  # 빈 줄
                writer.writerow(['고객번호', customer_number])
                writer.writerow(['출원인', applicant_name])
                writer.writerow(['조회일시', datetime.now().strftime('%Y-%m-%d %H:%M:%S')])
                writer.writerow([])  # 빈 줄

                # 헤더 설정
                headers = [
                    "번호", "출원번호", "등록번호", "출원인", "등록날짜", "발명명칭",
                    "해당연차수", "해당연차료", "납부마감일", "유효/불납",
                    "차기년도납부의뢰", "추납기간", "회복기간"
                ]
                writer.writerow(headers)

                # 데이터 입력
                for patent_data in patents_data:
                    writer.writerow(patent_data)

            return filename

        except Exception as e:
            print(f"❌ CSV 파일 생성 오류: {e}")
            return None

def main():
    """더 이상 사용되지 않는 메인 실행 함수"""
    print("⚠️ 이 Python 스크립트는 더 이상 사용되지 않습니다.")
    print("Node.js 기반 웹 시스템을 사용하세요:")
    print("1. npm install")
    print("2. npm start")
    print("3. 브라우저에서 http://localhost:3000 접속")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ 사용자에 의해 프로그램이 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 예상치 못한 오류 발생: {e}")
        sys.exit(1)