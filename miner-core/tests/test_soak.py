from minerd.soak import run


def test_three_minute_accelerated_soak_has_no_missed_epoch():
    result = run(3 / 60)
    assert result["ok"] is True
    assert result["epochs"] == 3
    assert result["missed_epochs"] == 0
