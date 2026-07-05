from app.adapters.primary_retailer_crawler_adapter import PrimaryRetailerCrawlerAdapter


def test_primary_retailer_adapter_parse_links():
    adapter = PrimaryRetailerCrawlerAdapter()
    html = """
    <html>
      <a href="/store/goods/getGoodsDetail.do?goodsNo=A000000123">상품</a>
      <a href="https://www.oliveyoung.co.kr/store/G.do?goodsNo=A000000124">상품2</a>
    </html>
    """

    links = adapter.parse_product_links(html)

    assert links == [
        "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000123",
        "https://www.oliveyoung.co.kr/store/G.do?goodsNo=A000000124",
    ]


def test_primary_retailer_adapter_parse_detail_output():
    adapter = PrimaryRetailerCrawlerAdapter()
    fixture_html = """
    <html>
      <head>
        <link rel="canonical" href="https://www.oliveyoung.co.kr/store/G.do?goodsNo=A123456789" />
      </head>
      <body>
        <input type="hidden" id="goodsNo" value="A123456789">
        <button class="btn-brand">라운드랩</button>
        <h3 class="GoodsDetailInfo_title">[1+1 기획] 1025 독도 토너 200ml</h3>
        <table><tr><th>전성분</th><td>정제수, 글리세린, 부틸렌글라이콜</td></tr></table>
      </body>
    </html>
    """

    result = adapter.parse_product_detail(fixture_html)

    assert result.brand == "라운드랩"
    assert result.product_name == "1025 독도 토너"
    assert result.normalized_name == "1025독도토너"
    assert result.ingredients == "정제수, 글리세린, 부틸렌글라이콜"
    assert result.source == "oliveyoung"
    assert result.source_product_id == "A123456789"
    assert result.product_url.endswith("goodsNo=A123456789")
    assert result.status == "active"
