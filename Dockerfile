FROM node:22

WORKDIR /opt/sqdgn-pipes

COPY . .

RUN corepack enable
RUN yarn install

ENTRYPOINT ["bash", "-c"]

# docker build -t mo4islona/sqdgn-pipes:latest .