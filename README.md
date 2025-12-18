# 수행평가 일정 관리 (Student Task Manager)

Apple 스타일의 세련된 디자인을 적용한 수행평가 일정 관리 웹 어플리케이션입니다.

## 🚀 주요 기능
- **PWA 지원**: 앱처럼 설치하여 오프라인에서도 사용 가능
- **Apple 디자인 시스템**: iOS 스타일의 인터페이스와 애니메이션
- **반별 일정 조회**: 1~5반까지 각각의 구글 시트 데이터 연동
- **보완된 보안**: "로봇이 아닙니다" 캡차 및 회원가입/로그인 시스템
- **일정 추가**: n8n 워크플로우를 통한 구글 시트 실시간 데이터 전송

## 🛠 기술 스택
- HTML5, CSS3, JavaScript (Vanilla JS)
- Service Worker (Caching)
- LocalStorage (User Data & Session)
- Google Sheets API (CSV Export)
- n8n (Backend Webhook)

## 📦 배포 방법 (GitHub Pages)
1. GitHub 리포지토리를 생성합니다.
2. 로컬 파일을 업로드합니다.
3. 리포지토리 설정(Settings) > Pages 에서 브랜치를 `main`으로 설정하고 저장합니다.
4. 잠시 후 생성되는 URL로 접속합니다.

## ⚠️ 주의사항
- 본 프로젝트는 클라이언트 사이드에서 작동하며, 사용자 정보는 브라우저의 `localStorage`에 저장됩니다.
- 시트 데이터 수정을 위해서는 n8n 워크플로우 설정이 필요합니다.
