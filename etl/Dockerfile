FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Taipei

RUN apt-get update && apt-get install -y --no-install-recommends \
        tzdata \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY etl ./etl
COPY etl.sh ./etl.sh
RUN chmod +x ./etl.sh

ENV DATA_DIR=/data
RUN mkdir -p /data

CMD ["python", "-m", "etl.pipeline", "--mode", "season", "--latest"]
