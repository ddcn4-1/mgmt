## 1. SpringBoot CORS error 설정

## 2. 폴더 구조

## 3. 기존 데이터 확인

![frontend](./image/Pasted%20image%2020250910083611.png)

## 4. 백엔드 데이터 작업 후 확인

![backenddata](./image/Pasted%20image%2020250910083715.png)

```json
[
    {
        "performanceId": 2,
        "title": "Test title",
        "venue": "서울 예술의 전당",
        "theme": "testTheme",
        "posterUrl": "https://www.google.com/imgres?q=image&imgurl=https%3A%2F%2Fplus.unsplash.com%2Fpremium_photo-1664474619075-644dd191935f%3Ffm%3Djpg%26q%3D60%26w%3D3000%26ixlib%3Drb-4.1.0%26ixid%3DM3wxMjA3fDB8MHxzZWFyY2h8MXx8aW1hZ2V8ZW58MHx8MHx8fDA%253D&imgrefurl=https%3A%2F%2Funsplash.com%2Fko%2Fs%2F%25EC%2582%25AC%25EC%25A7%2584%2Fimage&docid=ekX6V7UFf69LuM&tbnid=2brKLR3s5kTpPM&vet=12ahUKEwilyOrmm8uPAxUcklYBHbThDFgQM3oECBgQAA..i&w=3000&h=2003&hcb=2&ved=2ahUKEwilyOrmm8uPAxUcklYBHbThDFgQM3oECBgQAA",
        "price": 2000.0,
        "status": "UPCOMING",
        "startDate": "2025-09-04",
        "endDate": "2025-09-19",
        "runningTime": 120,
        "venueAddress": "서울특별시 서초구 남부순환로 2406",
        "schedules": [
            {
                "scheduleId": 3,
                "showDatetime": "2025-09-15T17:37:53",
                "availableSeats": 100,
                "totalSeats": 1000,
                "status": "OPEN"
            },
            {
                "scheduleId": 2,
                "showDatetime": "2025-09-14T17:25:18",
                "availableSeats": 200,
                "totalSeats": 2000,
                "status": "OPEN"
            }
        ]
    },
    {
        "performanceId": 3,
        "title": "Test title2",
        "venue": "서울 예술의 전당",
        "theme": "test2Thme",
        "posterUrl": "test2 url",
        "price": 3000.0,
        "status": "UPCOMING",
        "startDate": "2025-09-11",
        "endDate": "2025-09-12",
        "runningTime": 200,
        "venueAddress": "서울특별시 서초구 남부순환로 2406",
        "schedules": []
    }
]
```

## 5. interface type 변경

![interface](./image/Pasted%20image%2020250910091041.png)

## 6. migration할 component 에 backendAPI import (mockserver 대체)

![componenet](./image/Pasted%20image%2020250910085236.png)

## 7. frontend 에서 BackendAPI service 생성

### 1. app.config.ts에서 엔드포인트 설정

![appconfig](./image/Pasted%20image%2020250910084706.png)

### 2. mockserver.ts에서 apiService로 migration 할 함수 확인

![mockserver](./image/Pasted%20image%2020250910084529.png)

### 3. apiService.ts에서 ServerAPI 안에 migration 한 함수 추가

![apiservice](./image/Pasted%20image%2020250910084549.png)

## 8. migration할 component에서 호출하는 api 변경

### 1. 이전

![before](./image/Pasted%20image%2020250910085330.png)
![berfore2](./image/Pasted%20image%2020250910085616.png)
![before3](./image/Pasted%20image%2020250910085822.png)

### 2. 이후

![after](./image/Pasted%20image%2020250910090051.png)
![after](./image/Pasted%20image%2020250910090259.png)
![after](./image/Pasted%20image%2020250910090051.png)
