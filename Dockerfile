FROM python:3.13-alpine

RUN adduser -D -H -u 1000 tyra && mkdir /data && chown tyra /data
WORKDIR /app
COPY server.py ./
COPY public ./public

ENV PORT=8000 DATA_DIR=/data PYTHONUNBUFFERED=1
USER tyra
EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=1m --timeout=5s --start-period=10s --start-interval=2s \
  CMD wget -qO /dev/null http://127.0.0.1:8000/api/state || exit 1

CMD ["python", "server.py"]
