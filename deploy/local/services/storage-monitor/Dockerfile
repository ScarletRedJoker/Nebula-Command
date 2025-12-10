FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    smartmontools \
    nvme-cli \
    hdparm \
    lsscsi \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY healthcheck.py .

EXPOSE 9634

CMD ["python", "app.py"]
