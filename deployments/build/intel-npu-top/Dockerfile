# Simple Intel NPU monitoring container
# This is a placeholder implementation that would need to be customized for actual NPU monitoring
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    procps \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org flask psutil

WORKDIR /app

# Create a simple NPU monitoring script
COPY npu-monitor.py /app/
COPY start.sh /app/

RUN chmod +x /app/start.sh

EXPOSE 9103

CMD ["/app/start.sh"]