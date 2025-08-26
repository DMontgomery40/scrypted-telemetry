# Intel NPU Prometheus Exporter
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org requests flask prometheus_client

WORKDIR /app

COPY npu-exporter.py /app/
COPY start.sh /app/

RUN chmod +x /app/start.sh

EXPOSE 9104

CMD ["/app/start.sh"]