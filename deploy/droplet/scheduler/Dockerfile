FROM alpine:3.21

RUN apk add --no-cache bash curl jq tzdata

WORKDIR /opt/crawler
COPY trigger-crawl.sh /opt/crawler/trigger-crawl.sh
COPY scheduler-loop.sh /opt/crawler/scheduler-loop.sh
RUN chmod +x /opt/crawler/trigger-crawl.sh /opt/crawler/scheduler-loop.sh

ENTRYPOINT ["/opt/crawler/scheduler-loop.sh"]
