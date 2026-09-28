"""Read-only media metadata/bytes on pipeline host; credentials never leave it."""
import base64
import concurrent.futures
import json
import sys

import boto3
from botocore.config import Config
from dotenv import dotenv_values
import psycopg
from psycopg.rows import dict_row


def main(request):
    env = dotenv_values('.env')
    with psycopg.connect(env['PG_DATABASE_URL'].replace('postgresql+psycopg://', 'postgresql://'),
            options='-c default_transaction_read_only=on -c statement_timeout=60000', row_factory=dict_row) as connection:
        rows = connection.execute("""SELECT qid,filename,source_flag,url,resources FROM dev.entity_images
            WHERE qid = ANY(%s) AND (source_flag IN ('wikidata-logo','wikidata-image')
                OR filename ~* 'logo|seal|arms|emblem')
            ORDER BY qid,CASE source_flag WHEN 'wikidata-logo' THEN 0 WHEN 'wikidata-image' THEN 1 ELSE 2 END,
                ABS(COALESCE(aspect_ratio,1)-1),url_md5""", (request['ids'],)).fetchall()
    if request['mode'] == 'metadata':
        print(json.dumps(rows, ensure_ascii=False))
        return
    # Resolve requested objects from the scoped database rows, never arbitrary S3 keys.
    available = {(row['qid'],row['url']):row for row in rows}
    client = boto3.client('s3', endpoint_url=env['S3_ENDPOINT_URL'],
        aws_access_key_id=env['S3_ACCESS_KEY_ID'], aws_secret_access_key=env['S3_SECRET_ACCESS_KEY'],
        config=Config(connect_timeout=5,read_timeout=15,retries={'max_attempts':1},max_pool_connections=8))
    def download(item):
        try:
            row = available[(item['id'],item['sourceUrl'])]
            resource = row['resources'].get('webp_resize_v1') or row['resources'].get('original')
            if not resource:
                raise ValueError('missing-object')
            with client.get_object(Bucket='univ-rank',Key=resource['path'])['Body'] as body:
                data = body.read(15_000_001)
            if len(data) > 15_000_000:
                raise ValueError('oversize-object')
            return {**item, 'data':base64.b64encode(data).decode()}
        except Exception as error:
            return {**item, 'error':type(error).__name__}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        for result in executor.map(download,request['assets']):
            print(json.dumps(result,ensure_ascii=False),flush=True)
